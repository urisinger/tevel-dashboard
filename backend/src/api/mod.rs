use std::{collections::VecDeque, path::PathBuf, sync::Arc};

use axum::{
    body::Bytes,
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
    http::StatusCode,
    response::{Html, IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD as base64_engine, Engine};
use clap::Parser;
use codespan_reporting::term;
use futures::{SinkExt, StreamExt};
use parking_lot::RwLock;
use serde_json::Value;
use tokio::{fs, sync::broadcast};
use tracing::error;
use type_expr_compiler::{compile, writer::render_diagnostics};

#[cfg(feature = "endnode")]
use std::{net::SocketAddr, time::Duration};
#[cfg(feature = "endnode")]
use tokio::sync::mpsc;

#[cfg(feature = "endnode")]
mod endnode;

#[derive(Parser, Debug, Clone)]
pub struct ApiOpts {
    #[cfg(feature = "endnode")]
    #[clap(long, default_value = "127.0.0.1:9002")]
    pub endnode_addr: SocketAddr,

    #[cfg(feature = "endnode")]
    #[clap(long, default_value_t = 2)]
    pub retry_delay: u64,

    #[clap(long, default_value_t = 64)]
    pub in_chan_capacity: usize,

    #[clap(long, default_value_t = 16)]
    pub out_broadcast_capacity: usize,

    #[arg(long, default_value = "structs.def")]
    structs: PathBuf,
}

#[derive(Clone)]
struct ApiState {
    #[cfg(feature = "endnode")]
    tx_in: mpsc::Sender<Bytes>,

    tx_out: broadcast::Sender<Bytes>,
    recv_history: Arc<RwLock<VecDeque<Bytes>>>,
    structs_path: PathBuf,
    structs_json: Arc<RwLock<Result<Value, String>>>,
}

pub async fn api_service<S>(opt: ApiOpts) -> Router<S> {
    #[cfg(feature = "endnode")]
    let (tx_in, rx_in) = mpsc::channel(opt.in_chan_capacity);
    let tx_out = broadcast::Sender::new(opt.out_broadcast_capacity);

    let structs_json = Arc::new(RwLock::new(
        load_structs(&opt.structs)
            .await
            .inspect_err(|e| error!("{e:?}")),
    ));

    let state = ApiState {
        #[cfg(feature = "endnode")]
        tx_in,

        tx_out: tx_out.clone(),
        recv_history: Default::default(),
        structs_path: opt.structs.clone(),

        structs_json,
    };

    #[cfg(feature = "endnode")]
    tokio::spawn(endnode::endnode_task(
        opt.endnode_addr,
        Duration::from_secs(opt.retry_delay),
        rx_in,
        tx_out,
        state.recv_history.clone(),
    ));

    Router::new()
        .route("/ws/", get(ws_handler))
        .route("/history", get(history_handler))
        .route("/structs.json", get(serve_structs_json))
        .route("/structs/refresh", post(refresh_structs_handler))
        .with_state(state)
}

async fn history_handler(State(state): State<ApiState>) -> impl IntoResponse {
    let hist = state.recv_history.read();
    let payloads: Vec<_> = hist
        .iter()
        .map(|msg| {
            serde_json::json!({
                "type": "Outbound",
                "data": base64_engine.encode(msg),
            })
        })
        .collect();

    Json(payloads)
}

async fn serve_structs_json(State(state): State<ApiState>) -> Response {
    match &*state.structs_json.read() {
        Ok(v) => (StatusCode::OK, Json(v.clone())).into_response(),
        Err(html_fragment) => (
            StatusCode::UNPROCESSABLE_ENTITY,
            Html(html_fragment.clone()),
        )
            .into_response(),
    }
}

async fn refresh_structs_handler(State(state): State<ApiState>) -> Response {
    *state.structs_json.write() = load_structs(&state.structs_path).await;
    serve_structs_json(State(state)).await
}

async fn load_structs(path: &PathBuf) -> Result<Value, String> {
    let src = fs::read_to_string(path).await.map_err(|e| e.to_string())?;

    match compile(path.display().to_string(), &src) {
        Ok(json_str) => serde_json::from_str::<Value>(&json_str).map_err(|e| e.to_string()),
        Err(err) => {
            let config = term::Config::default();
            let mut buf = Vec::new();
            render_diagnostics(&mut buf, &err.diagnostics, &err.files, &config)
                .map_err(|e| e.to_string())?;
            let html_fragment =
                String::from_utf8(buf).unwrap_or_else(|_| "Internal render error".to_string());
            Err(html_fragment)
        }
    }
}

async fn ws_handler(ws: WebSocketUpgrade, State(state): State<ApiState>) -> impl IntoResponse {
    let state = state.clone();

    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: ApiState) {
    let mut rx_out = state.tx_out.subscribe();

    let (mut ws_tx, mut ws_rx) = socket.split();

    let client_to_backend = async {
        while let Some(Ok(Message::Binary(data))) = ws_rx.next().await {
            #[cfg(feature = "endnode")]
            {
                let _ = state.tx_in.send(data).await;
            }

            #[cfg(not(feature = "endnode"))]
            {
                let mut hist = state.recv_history.write();
                if hist.len() >= 100 {
                    hist.pop_front();
                }
                hist.push_back(data.clone());
                let _ = state.tx_out.send(data);
            }
        }
    };

    let backend_to_client = async {
        while let Ok(msg) = rx_out.recv().await {
            if ws_tx.send(Message::Binary(msg)).await.is_err() {
                break;
            }
        }
    };

    tokio::select! {
        _ = client_to_backend => {},
        _ = backend_to_client => {},
    }
}

use std::{collections::VecDeque, net::SocketAddr, path::PathBuf, sync::Arc, time::Duration};

use axum::{
    extract::State,
    http::StatusCode,
    response::{Html, IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD as base64_engine, Engine};
use clap::Parser;
use codespan_reporting::term;
use parking_lot::RwLock;
use serde_json::Value;
use tcp_proxy::{tcp_task, ws_handler};
use tokio::{
    fs,
    sync::{broadcast, mpsc},
};
use tracing::error;
use type_expr_compiler::{compile, writer::render_diagnostics};

mod tcp_proxy;

#[derive(Parser, Debug, Clone)]
pub struct ApiOpts {
    #[clap(long, default_value = "127.0.0.1:9002")]
    pub in_addr: SocketAddr,

    #[clap(long, default_value = "127.0.0.1:9001")]
    pub out_addr: SocketAddr,

    #[clap(long, default_value_t = 2)]
    pub retry_delay: u64,

    #[clap(long, default_value_t = 64)]
    pub in_chan_capacity: usize,

    #[clap(long, default_value_t = 16)]
    pub out_broadcast_capacity: usize,

    #[clap(long)]
    pub dev: bool,

    #[arg(long)]
    structs: PathBuf,
}

#[derive(Clone)]
struct ApiState {
    tx_in: mpsc::Sender<Box<[u8]>>,
    tx_out: broadcast::Sender<Box<[u8]>>,
    ws_echo: broadcast::Sender<axum::extract::ws::Message>,
    recv_history: Arc<RwLock<VecDeque<Box<[u8]>>>>,
    dev: bool,
    structs_path: PathBuf,
    structs_json: Arc<RwLock<Result<Value, String>>>,
}

pub async fn api_service<S>(opt: ApiOpts) -> Router<S> {
    // Channels for TCP proxy
    let (tx_in, rx_in) = mpsc::channel::<Box<[u8]>>(opt.in_chan_capacity);
    let tx_out = broadcast::Sender::<Box<[u8]>>::new(opt.out_broadcast_capacity);

    // Channel for WS echo/broadcast
    let (ws_echo_tx, _) = broadcast::channel::<axum::extract::ws::Message>(64);

    let structs_json = Arc::new(RwLock::new(
        load_structs(&opt.structs)
            .await
            .inspect_err(|e| error!("{e:?}")),
    ));

    let state = ApiState {
        tx_in,
        tx_out: tx_out.clone(),
        ws_echo: ws_echo_tx.clone(),
        recv_history: Default::default(),
        dev: opt.dev,
        structs_path: opt.structs.clone(),

        structs_json,
    };

    let recv_history = state.recv_history.clone();
    let retry_delay = Duration::from_secs(opt.retry_delay);
    let in_addr = opt.in_addr;
    let out_addr = opt.out_addr;

    if !opt.dev {
        tokio::spawn(tcp_task(
            in_addr,
            out_addr,
            retry_delay,
            rx_in,
            tx_out,
            recv_history,
        ));
    }

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
            let html_fragment = String::from_utf8(buf)
                .unwrap_or_else(|_| "<div>Internal render error</div>".to_string());
            Err(html_fragment)
        }
    }
}

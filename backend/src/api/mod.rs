use std::{collections::VecDeque, convert::Infallible, path::PathBuf, sync::Arc};

use axum::{
    body::Bytes,
    extract::State,
    http::StatusCode,
    response::{sse::Event, Html, IntoResponse, Response, Sse},
    routing::{get, post},
    Json, Router,
};
use base64::{engine::general_purpose, Engine};
use clap::Parser;
use codespan_reporting::term;
use futures::{Stream, StreamExt};
use parking_lot::RwLock;
use serde_json::Value;
use tokio::{fs, sync::broadcast};
use tokio_stream::wrappers::BroadcastStream;
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
        .route("/history", get(history_handler))
        .route("/send", post(send_packet))
        .route("/structs.json", get(serve_structs_json))
        .route("/structs/refresh", post(refresh_structs_handler))
        .with_state(state)
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

async fn history_handler(
    State(state): State<ApiState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let history_b64: Vec<String> = {
        let hist = state.recv_history.read();
        hist.iter()
            .map(|b| general_purpose::STANDARD.encode(b))
            .collect()
    };

    let history_json =
        serde_json::to_string(&history_b64).expect("failed to serialize history array");

    let history_event = Event::default().event("history").data(history_json);
    let live_stream = BroadcastStream::new(state.tx_out.subscribe())
        .filter_map(|res| async move { res.ok() })
        .map(|bytes: Bytes| {
            let b64 = general_purpose::STANDARD.encode(&bytes);
            Ok(Event::default().event("packet").data(b64))
        });

    let stream =
        futures::stream::once(async { Ok::<_, Infallible>(history_event) }).chain(live_stream);

    Sse::new(stream)
}

async fn send_packet(State(state): State<ApiState>, body: Bytes) -> impl IntoResponse {
    #[cfg(feature = "endnode")]
    {
        _ = state.tx_in.send(body).await;
    }
    #[cfg(not(feature = "endnode"))]
    {
        {
            let mut hist = state.recv_history.write();
            if hist.len() >= 100 {
                hist.pop_front();
            }
            hist.push_back(body.clone());
        }
        _ = state.tx_out.send(body);
    }

    StatusCode::OK
}

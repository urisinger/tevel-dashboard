use std::{
    collections::VecDeque,
    net::SocketAddr,
    path::PathBuf,
    sync::{Arc, LazyLock},
    time::Duration,
};

use axum::{
    extract::State,
    http::StatusCode,
    response::{Html, IntoResponse},
    routing::get,
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD as base64_engine, Engine};
use clap::Parser;
use codespan_reporting::term;
use notify::Watcher;
use parking_lot::RwLock;
use serde_json::Value;
use tcp_proxy::{tcp_task, ws_handler};
use tokio::{
    fs,
    sync::{broadcast, mpsc},
};
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
    structs: Option<PathBuf>,
}

#[derive(Clone)]
struct ApiState {
    tx_in: mpsc::Sender<Box<[u8]>>,
    tx_out: broadcast::Sender<Box<[u8]>>,
    ws_echo: broadcast::Sender<axum::extract::ws::Message>,
    recv_history: Arc<RwLock<VecDeque<Box<[u8]>>>>,
    dev: bool,
}

static STRUCTS_JSON: LazyLock<Arc<RwLock<Option<Result<Value, String>>>>> =
    LazyLock::new(|| Arc::new(RwLock::new(None)));

pub async fn api_service<S>(opt: ApiOpts) -> Router<S> {
    // Channels for TCP proxy
    let (tx_in, rx_in) = mpsc::channel::<Box<[u8]>>(opt.in_chan_capacity);
    let tx_out = broadcast::Sender::<Box<[u8]>>::new(opt.out_broadcast_capacity);

    // Channel for WS echo/broadcast
    let (ws_echo_tx, _) = broadcast::channel::<axum::extract::ws::Message>(64);

    let state = ApiState {
        tx_in,
        tx_out: tx_out.clone(),
        ws_echo: ws_echo_tx.clone(),
        recv_history: Default::default(),
        dev: opt.dev,
    };

    // Optional structs.json loading
    if let Some(path) = opt.structs.as_ref() {
        load_structs_once(path).await;
        watch_structs_file(path.clone());
    }

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

async fn serve_structs_json() -> impl IntoResponse {
    match &*STRUCTS_JSON.read() {
        // never loaded
        None => (
            StatusCode::BAD_REQUEST,
            "File missing, try enabling the static-files feature",
        )
            .into_response(),

        // successfully compiled JSON
        Some(Ok(v)) => (StatusCode::OK, Json(v.clone())).into_response(),

        // compile error: send back your HTML fragment with a 422 status
        Some(Err(html_fragment)) => (
            StatusCode::UNPROCESSABLE_ENTITY,
            Html(html_fragment.clone()),
        )
            .into_response(),
    }
}

pub async fn load_structs_once(path: &PathBuf) {
    // 1) Read .def source
    let src = match fs::read_to_string(path).await {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Error reading `{}`: {}", path.display(), e);
            return;
        }
    };

    // 2) Attempt compile(filename, src)
    match compile(path.display().to_string(), &src) {
        // a) Success → parse JSON
        Ok(json_str) => match serde_json::from_str::<Value>(&json_str) {
            Ok(parsed) => {
                let mut lock = STRUCTS_JSON.write();
                *lock = Some(Ok(parsed));
            }
            Err(e) => {
                eprintln!("JSON parse error for `{}` output: {}", path.display(), e);
            }
        },

        // b) CompileError → render diagnostics to HTML fragment
        Err(err) => {
            // prepare a buffer and default config
            let config = term::Config::default();
            let mut buf = Vec::new();

            // render_diagnostics writes a full <div>… with styles + <pre>
            render_diagnostics(&mut buf, &err.diagnostics, &err.files, &config)
                .expect("render_diagnostics failed");

            let html_fragment = String::from_utf8(buf)
                .unwrap_or_else(|_| "<div>Internal render error</div>".to_string());

            let mut lock = STRUCTS_JSON.write();
            *lock = Some(Err(html_fragment));
        }
    }
}

fn watch_structs_file(def_path: PathBuf) {
    std::thread::spawn(move || {
        let (tx, rx) = std::sync::mpsc::channel();
        let mut watcher = notify::recommended_watcher(tx).expect("Failed to create watcher");
        let dir = def_path.parent().expect("Cannot watch root directory");
        watcher
            .watch(dir, notify::RecursiveMode::NonRecursive)
            .expect("Failed to watch .def file parent");

        println!("📡 Watching {} for changes...", def_path.display());
        let filename = def_path.display().to_string();

        for event in rx.iter().flatten() {
            if !(event
                .paths
                .iter()
                .any(|p| p.file_name().and_then(|s| s.to_str()) == Some(&filename))
                && event.kind.is_modify())
            {
                continue;
            }

            println!("🔄 Change detected, recompiling…");

            // 1) Sync-read the file
            let src = match std::fs::read_to_string(&def_path) {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("Error reading `{}`: {}", def_path.display(), e);
                    continue;
                }
            };

            // 2) compile or render diagnostics
            let result: Result<Value, String> = match compile(&filename, &src) {
                Ok(json_str) => match serde_json::from_str::<Value>(&json_str) {
                    Ok(val) => Ok(val),
                    Err(e) => {
                        eprintln!("JSON parse error: {}", e);
                        continue;
                    }
                },
                Err(err) => {
                    // render diagnostics
                    let config = term::Config::default();
                    let mut buf = Vec::new();
                    render_diagnostics(&mut buf, &err.diagnostics, &err.files, &config)
                        .expect("render_diagnostics failed");
                    let html = String::from_utf8(buf)
                        .unwrap_or_else(|_| "<div>Internal render error</div>".to_string());
                    Err(html)
                }
            };

            // 3) Store into the async RwLock via a small runtime
            let lock = STRUCTS_JSON.clone();
            let mut guard = lock.write();
            *guard = Some(result);
            if guard.as_ref().unwrap().is_ok() {
                println!("✅ In-memory structs.json updated");
            }
        }
    });
}

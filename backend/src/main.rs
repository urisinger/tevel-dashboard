use clap::Parser;
use std::{net::SocketAddr, time::Duration};

use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
    response::IntoResponse,
    routing::get,
    Router,
};
use futures::{SinkExt, StreamExt};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    sync::{broadcast, mpsc},
    time::sleep,
};

#[derive(Parser, Debug)]
#[clap(author, version, about)]
struct Opt {
    /// Address for incoming WebSocket connections
    #[clap(long, default_value = "0.0.0.0:8080")]
    ws_addr: SocketAddr,

    /// TCP IN server address
    #[clap(long, default_value = "127.0.0.1:9002")]
    in_addr: SocketAddr,

    /// TCP OUT server address
    #[clap(long, default_value = "127.0.0.1:9001")]
    out_addr: SocketAddr,

    /// Retry delay in seconds
    #[clap(long, default_value_t = 2)]
    retry_delay: u64,

    /// Capacity of the WebSocket→TCP channel
    #[clap(long, default_value_t = 64)]
    in_chan_capacity: usize,

    /// Capacity of the TCP→WebSocket broadcast
    #[clap(long, default_value_t = 16)]
    out_broadcast_capacity: usize,
}

#[derive(Clone)]
struct AppState {
    // Sender for data coming from the websockets into the tcp steam
    tx_in: mpsc::Sender<Vec<u8>>,
    // Sender for data coming from the tcp stream into the websockets, used just to create new recivers
    tx_out: broadcast::Sender<Vec<u8>>,
}

#[tokio::main]
async fn main() {
    let opt = Opt::parse();
    let (tx_in, mut rx_in) = mpsc::channel::<Vec<u8>>(opt.in_chan_capacity);
    let tx_out = broadcast::Sender::<Vec<u8>>::new(opt.out_broadcast_capacity);
    let tx_out_c = tx_out.clone();

    let retry_delay = Duration::from_secs(opt.retry_delay);
    let in_addr = opt.in_addr;
    let out_addr = opt.out_addr;
    tokio::spawn(async move {
        let mut tcp_in: Option<TcpStream> = None;
        let mut tcp_out: Option<TcpStream> = None;

        loop {
            if tcp_in.is_none() {
                if let Ok(s) = TcpStream::connect(in_addr).await {
                    s.set_nodelay(true).ok();
                    println!("✅ IN connected");
                    tcp_in = Some(s);
                } else {
                    println!("⚠️ IN connect failed, retrying...");
                }
            }
            if tcp_out.is_none() {
                if let Ok(s) = TcpStream::connect(out_addr).await {
                    s.set_nodelay(true).ok();
                    println!("✅ OUT connected");
                    tcp_out = Some(s);
                } else {
                    println!("⚠️ OUT connect failed, retrying...");
                }
            }

            tokio::select! {
                // Send data coming from websockets into tcp stream
                Some(data) = rx_in.recv(), if tcp_in.is_some() => {
                    if let Err(e) = tcp_in.as_mut().unwrap().write_all(&data).await {
                        eprintln!("❌ write to IN failed: {}", e);
                        tcp_in = None;
                    }
                }

                // Send data coming from tcp steam into websockets
                Ok((n, buf)) = async {
                    if let Some(sock) = tcp_out.as_mut() {
                        let mut buf = vec![0; 1024];
                        match sock.read(&mut buf).await {
                            Ok(0) => {
                                tcp_in = None;
                                Err(())
                            },        // closed
                            Ok(n) => Ok((n, buf)),
                            Err(_) => Err(()),
                        }
                    } else { Err(()) }
                }, if tcp_out.is_some() => {
                    let _ = tx_out.send(buf[..n].to_vec());
                }

                // nothing ready, sleep
                else => {
                    sleep(retry_delay).await;
                }
            }
        }
    });

    let state = AppState {
        tx_in,
        tx_out: tx_out_c,
    };

    let app = Router::new()
        .route("/ws", get(ws_handler))
        .with_state(state);

    let listener = TcpListener::bind(opt.ws_addr).await.unwrap();
    println!("🚀 Listening on ws://{}", opt.ws_addr);
    axum::serve(listener, app).await.unwrap();
}

// WS handler
async fn ws_handler(
    ws: WebSocketUpgrade,
    State(AppState { tx_in, tx_out }): State<AppState>,
) -> impl IntoResponse {
    let rx_out = tx_out.subscribe();
    ws.on_upgrade(move |socket| handle_socket(socket, tx_in, rx_out))
}

async fn handle_socket(
    socket: WebSocket,
    tx_in: mpsc::Sender<Vec<u8>>,
    mut rx_out: broadcast::Receiver<Vec<u8>>,
) {
    let (mut ws_tx, mut ws_rx) = socket.split();

    // Forward WS→manager
    let to_mgr = async {
        while let Some(Ok(Message::Binary(data))) = ws_rx.next().await {
            let _ = tx_in.send(data.to_vec()).await;
        }
    };

    // Forward manager→WS
    let to_ws = async {
        while let Ok(data) = rx_out.recv().await {
            if ws_tx.send(Message::binary(data)).await.is_err() {
                break;
            }
        }
    };

    tokio::select! {
        _ = to_mgr => {},
        _ = to_ws  => {},
    }

    println!("🔌 WS connection closed");
}

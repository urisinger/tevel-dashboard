use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
    response::IntoResponse,
};
use futures::{SinkExt, StreamExt};
use parking_lot::RwLock;
use std::{collections::VecDeque, net::SocketAddr, sync::Arc, time::Duration};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
    sync::{broadcast, mpsc},
    time::sleep,
};
use tracing::{error, info, warn};

use super::ApiState;

/// Core TCP ↔ WebSocket proxy task (unchanged).
pub async fn tcp_task(
    in_addr: SocketAddr,
    out_addr: SocketAddr,
    retry_delay: Duration,
    mut rx_in: mpsc::Receiver<Box<[u8]>>,
    tx_out: broadcast::Sender<Box<[u8]>>,
    recv_history: Arc<RwLock<VecDeque<Box<[u8]>>>>,
) {
    let mut tcp_in: Option<TcpStream> = None;
    let mut tcp_out: Option<TcpStream> = None;

    loop {
        if tcp_in.is_none() {
            if let Ok(s) = TcpStream::connect(in_addr).await {
                s.set_nodelay(true).ok();
                info!("IN connected");
                tcp_in = Some(s);
            } else {
                warn!("IN connect failed, retrying...");
            }
        }
        if tcp_out.is_none() {
            if let Ok(s) = TcpStream::connect(out_addr).await {
                s.set_nodelay(true).ok();
                info!("OUT connected");
                tcp_out = Some(s);
            } else {
                warn!("OUT connect failed, retrying...");
            }
        }

        tokio::select! {
            // forward from WebSocket → TCP_IN
            Some(data) = rx_in.recv(), if tcp_in.is_some() => {
                if let Err(e) = tcp_in.as_mut().unwrap().write_all(&data).await {
                    error!("write to IN failed: {}", e);
                    tcp_in = None;
                }
            }

            // read from TCP_OUT → broadcast + history
            Ok((n, buf)) = async {
                if let Some(sock) = tcp_out.as_mut() {
                    let mut buf = vec![0; 1024];
                    match sock.read(&mut buf).await {
                        Ok(0) => {
                            tcp_in = None;
                            Err(())
                        },
                        Ok(n) => {
                            let data = buf[..n].to_vec().into_boxed_slice();
                            let mut history = recv_history.write();
                            if history.len() >= 100 {
                                history.pop_front();
                            }
                            history.push_back(data.clone());
                            Ok((n, buf))
                        },
                        Err(_) => Err(()),
                    }
                } else {
                    Err(())
                }
            }, if tcp_out.is_some() => {
                let _ = tx_out.send(buf[..n].to_vec().into_boxed_slice());
            }

            else => {
                sleep(retry_delay).await;
            }
        }
    }
}

/// HTTP handler for `/ws`—chooses proxy vs. echo mode.
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(ApiState {
        tx_in,
        tx_out,
        ws_echo,
        dev,
        recv_history,
        ..
    }): State<ApiState>,
) -> impl IntoResponse {
    let rx_out = tx_out.subscribe();

    if dev {
        // broadcast‐style echo
        ws.on_upgrade(move |socket| handle_echo_socket(socket, ws_echo.clone(), recv_history))
    } else {
        // original TCP proxy
        ws.on_upgrade(move |socket| handle_socket(socket, tx_in, rx_out))
    }
}

async fn handle_socket(
    socket: WebSocket,
    tx_in: mpsc::Sender<Box<[u8]>>,
    mut rx_out: broadcast::Receiver<Box<[u8]>>,
) {
    let (mut ws_tx, mut ws_rx) = socket.split();

    let to_mgr = async {
        while let Some(Ok(Message::Binary(data))) = ws_rx.next().await {
            let _ = tx_in.send(data.to_vec().into_boxed_slice()).await;
        }
    };

    let to_ws = async {
        while let Ok(data) = rx_out.recv().await {
            if ws_tx.send(Message::binary(data)).await.is_err() {
                break;
            }
        }
    };

    tokio::select! {
        _ = to_mgr => {},
        _ = to_ws => {},
    }
}

async fn handle_echo_socket(
    socket: WebSocket,
    ws_echo_tx: broadcast::Sender<Message>,
    recv_history: Arc<RwLock<VecDeque<Box<[u8]>>>>,
) {
    let (mut tx, mut rx_ws) = socket.split();
    let mut rx_echo = ws_echo_tx.subscribe();

    let incoming = async {
        while let Some(Ok(msg)) = rx_ws.next().await {
            // Broadcast to everyone (including sender)
            let to_send = match msg.clone() {
                Message::Binary(b) => {
                    let data = b.to_vec().into_boxed_slice();
                    let mut history = recv_history.write();
                    if history.len() >= 100 {
                        history.pop_front();
                    }
                    history.push_back(data);
                    Message::Binary(b)
                }

                other => other,
            };
            let _ = ws_echo_tx.send(to_send);
        }
    };

    // Channel → client
    let outgoing = async {
        while let Ok(msg) = rx_echo.recv().await {
            if tx.send(msg).await.is_err() {
                break;
            }
        }
    };

    tokio::select! {
        _ = incoming => {},
        _ = outgoing => {},
    }
}

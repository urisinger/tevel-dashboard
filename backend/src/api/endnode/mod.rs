use axum::body::Bytes;
use parking_lot::RwLock;
use serde_json::{json, Value};
use std::{collections::VecDeque, net::SocketAddr, sync::Arc, time::Duration};
use tokio::{
    net::{TcpListener, TcpStream},
    select,
    sync::{broadcast, mpsc},
    time::sleep,
};
use tracing::{error, info, warn};

fn extract_buffer(v: &Value) -> Option<Vec<u8>> {
    v.get("data")?
        .get("data")?
        .as_array()?
        .iter()
        .filter_map(|x| x.as_u64().map(|n| n as u8))
        .collect::<Vec<u8>>()
        .into()
}

/// Spawns your TCP server and hands off each connection to `handle_client`.
pub async fn endnode_task(
    addr: SocketAddr,
    retry_delay: Duration,
    mut rx_in: mpsc::Receiver<Bytes>,
    tx_out: broadcast::Sender<Bytes>,
    recv_history: Arc<RwLock<VecDeque<Bytes>>>,
) {
    // 1. Bind the listener
    let listener = loop {
        match TcpListener::bind(addr).await {
            Ok(l) => {
                info!("TCP server listening on {}", addr);
                break l;
            }
            Err(e) => {
                warn!(
                    "Failed to bind {}, retrying in {:?}: {}",
                    addr, retry_delay, e
                );
                sleep(retry_delay).await;
            }
        }
    };

    // 2. Accept loop
    loop {
        match listener.accept().await {
            Ok((stream, peer)) => {
                info!("New client from {}", peer);
                let rx_in_clone = rx_in.clone();
                let tx_out_clone = tx_out.clone();
                let history_clone = recv_history.clone();

                // 3. Spawn a per‑connection task
                tokio::spawn(async move {
                    if let Err(e) =
                        handle_client(stream, rx_in_clone, tx_out_clone, history_clone).await
                    {
                        error!("Connection {} closed with error: {}", peer, e);
                    } else {
                        info!("Connection {} cleanly closed", peer);
                    }
                });
            }
            Err(e) => {
                error!("Accept failed: {}", e);
                sleep(retry_delay).await;
            }
        }
    }
}

/// Handles a single client: reads JSON blobs, pushes to history/broadcasts,
/// and writes any incoming `rx_in` frames out over the socket.
async fn handle_client(
    mut tcp: TcpStream,
    mut rx_in: mpsc::Receiver<Bytes>,
    tx_out: broadcast::Sender<Bytes>,
    recv_history: Arc<RwLock<VecDeque<Bytes>>>,
) -> std::io::Result<()> {
    let mut buf = vec![0u8; 4096];

    loop {
        select! {
            // Outbound: data coming from your channel → write JSON to the client
            Some(raw) = rx_in.recv() => {
                let pkt = json!({
                    "data": {
                        "type": "Buffer",
                        "data": raw.to_vec()
                    }
                });
                let js = serde_json::to_vec(&pkt)
                    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
                tcp.write_all(&js).await?;
            }

            // Inbound: data arriving from the client → parse JSON, store & broadcast
            result = tcp.read(&mut buf) => {
                let n = result?;
                if n == 0 {
                    // client closed
                    return Ok(());
                }

                let raw = &buf[..n];
                match serde_json::from_slice::<Value>(raw) {
                    Ok(v) => {
                        if let Some(data) = extract_buffer(&v) {
                            let b = Bytes::from(data);
                            {
                                let mut hist = recv_history.write();
                                if hist.len() >= 100 { hist.pop_front(); }
                                hist.push_back(b.clone());
                            }
                            let _ = tx_out.send(b);
                        } else {
                            warn!("JSON missing data array: {}", String::from_utf8_lossy(raw));
                        }
                    }
                    Err(e) => {
                        warn!("JSON parse error ({} bytes): {}", n, e);
                    }
                }
            }

            // Prevent busy‑looping if both channels & socket are idle
            else => {
                sleep(Duration::from_millis(10)).await;
            }
        }
    }
}

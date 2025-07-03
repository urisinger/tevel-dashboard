use axum::body::Bytes;
use parking_lot::RwLock;
use serde_json::{json, Value};
use std::{collections::VecDeque, net::SocketAddr, sync::Arc};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    select,
    sync::{broadcast, mpsc},
};
use tracing::{info, warn};

fn extract_buffer(v: &Value) -> Option<Vec<u8>> {
    v.get("data")?
        .get("data")?
        .as_array()?
        .iter()
        .filter_map(|x| x.as_u64().map(|n| n as u8))
        .collect::<Vec<u8>>()
        .into()
}

/// Bind once, accept exactly one client, then handle it (panics on errors).
pub async fn endnode_task(
    addr: SocketAddr,
    rx_in: mpsc::Receiver<Bytes>,
    tx_out: broadcast::Sender<Bytes>,
    recv_history: Arc<RwLock<VecDeque<Bytes>>>,
) {
    // Crash if we can’t bind the port
    let listener = TcpListener::bind(addr)
        .await
        .expect("endnode_task: failed to bind TCP listener");

    info!("Listening on {}", addr);

    // Crash if accept fails
    let (stream, peer) = listener
        .accept()
        .await
        .expect("endnode_task: failed to accept incoming connection");

    info!("Accepted connection from {}", peer);

    // Crash if client handler returns an error
    handle_client(stream, rx_in, tx_out, recv_history)
        .await
        .expect("endnode_task: client handler encountered unrecoverable IO error");

    info!("Client {} disconnected, exiting endnode_task", peer);
}

async fn handle_client(
    mut tcp: TcpStream,
    mut rx_in: mpsc::Receiver<Bytes>,
    tx_out: broadcast::Sender<Bytes>,
    recv_history: Arc<RwLock<VecDeque<Bytes>>>,
) -> std::io::Result<()> {
    let mut buf = vec![0u8; 4096];

    loop {
        select! {
            // Outbound → write JSON to the client
            Some(raw) = rx_in.recv() => {
                let pkt = json!({
                    "data": {
                        "type": "Buffer",
                        "data": raw.to_vec()
                    }
                });
                let js = serde_json::to_vec(&pkt)
                    .expect("handle_client: failed to serialize JSON packet");
                tcp.write_all(&js).await?;
            }

            // Inbound → parse JSON, push to history & broadcast
            result = tcp.read(&mut buf) => {
                let n = result?;
                if n == 0 {
                    // clean shutdown by client
                    return Ok(());
                }
            }, if tcp.is_some() => {
                if n == 0{
                    tcp = None;
                    continue;
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
                            error!("JSON missing data.data array: {}", raw.escape_ascii());
                        }
                    }
                    Err(e) => {
                        warn!("handle_client: JSON parse error ({} bytes): {}", n, e);
                    }
                }
            }

        }
    }
}

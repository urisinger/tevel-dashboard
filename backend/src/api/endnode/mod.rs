use axum::body::Bytes;
use parking_lot::RwLock;
use serde_json::{json, Value};
use std::{collections::VecDeque, net::SocketAddr, sync::Arc, time::Duration};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
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

pub async fn endnode_task(
    addr: SocketAddr,
    retry_delay: Duration,
    mut rx_in: mpsc::Receiver<Bytes>,
    tx_out: broadcast::Sender<Bytes>,
    recv_history: Arc<RwLock<VecDeque<Bytes>>>,
) {
    let mut tcp: Option<TcpStream> = None;
    let mut buf = vec![0u8; 4096];

    loop {
        if tcp.is_none() {
            match TcpStream::connect(addr).await {
                Ok(s) => {
                    s.set_nodelay(true).ok();
                    info!("connected");
                    tcp = Some(s)
                }
                Err(e) => {
                    warn!("connect failed: {}", e);
                }
            }
        }

        select! {
            Some(raw) = rx_in.recv(), if tcp.is_some() => {
                let pkt = json!({
                    "data": {
                        "type": "Buffer",
                        "data": raw.to_vec()
                    }
                });
                match serde_json::to_vec(&pkt) {
                    Ok(js) => {
                        if let Err(e) = tcp.as_mut().unwrap().write_all(&js).await {
                            error!("send failed: {}", e);
                            tcp = None;
                        }
                    }
                    Err(e) => error!("JSON serialize failed: {}", e),
                }
            }

            Ok(n) = async {
                if let Some(sock) = tcp.as_mut() {
                    sock.read(&mut buf).await
                } else {
                    Err(std::io::ErrorKind::WouldBlock.into())
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
                                if hist.len() >= 100 { hist.pop_front();}
                                hist.push_back(b.clone());
                            }
                            let _ = tx_out.send(b);
                        } else {
                            error!("JSON missing data.data array: {}", raw.escape_ascii());
                        }
                    }
                    Err(e) => {
                        error!("JSON parse error ({} bytes): {}", n, e);
                    }
                }
            }

            else => {
                sleep(retry_delay).await;
            }
        }
    }
}

use axum::body::Bytes;
use parking_lot::RwLock;
use std::{collections::VecDeque, net::SocketAddr, sync::Arc};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    select,
    sync::{broadcast, mpsc},
};
use tracing::{info, warn};

/// Bridge endnode: accepts two TCP clients and forwards data between them.
/// Also integrates with the dashboard by broadcasting received data.
pub async fn bridge_task(
    addr: SocketAddr,
    rx_in: mpsc::Receiver<Bytes>,
    tx_out: broadcast::Sender<Bytes>,
    recv_history: Arc<RwLock<VecDeque<Bytes>>>,
) {
    let listener = TcpListener::bind(addr)
        .await
        .expect("bridge_task: failed to bind TCP listener");

    info!("Bridge listening on {}", addr);

    // Accept first client
    let (client1, peer1) = listener
        .accept()
        .await
        .expect("bridge_task: failed to accept first client");
    info!("Bridge: Client 1 connected from {}", peer1);

    // Accept second client
    let (client2, peer2) = listener
        .accept()
        .await
        .expect("bridge_task: failed to accept second client");
    info!("Bridge: Client 2 connected from {}", peer2);

    // Run the bridge
    handle_bridge(client1, client2, rx_in, tx_out, recv_history)
        .await
        .expect("bridge_task: bridge handler encountered unrecoverable IO error");

    info!("Bridge disconnected, exiting bridge_task");
}

async fn handle_bridge(
    mut client1: TcpStream,
    mut client2: TcpStream,
    mut rx_in: mpsc::Receiver<Bytes>,
    tx_out: broadcast::Sender<Bytes>,
    recv_history: Arc<RwLock<VecDeque<Bytes>>>,
) -> std::io::Result<()> {
    let mut buf1 = vec![0u8; 4096];
    let mut buf2 = vec![0u8; 4096];

    loop {
        select! {
            Some(data) = rx_in.recv() => {
                if let Err(e) = client1.write_all(&data).await {
                    warn!("Failed to write to client 1: {}", e);
                    return Err(e);
                }
            }

            result = client1.read(&mut buf1) => {
                let n = result?;
                if n == 0 {
                    info!("Client 1 disconnected");
                    return Ok(());
                }

                let data = Bytes::copy_from_slice(&buf1[..n]);
                
                // Forward to client 2
                if let Err(e) = client2.write_all(&data).await {
                    warn!("Failed to forward to client 2: {}", e);
                    return Err(e);
                }

                // Broadcast to dashboard
                {
                    let mut hist = recv_history.write();
                    if hist.len() >= 100 {
                        hist.pop_front();
                    }
                    hist.push_back(data.clone());
                }
                let _ = tx_out.send(data);
            }

            result = client2.read(&mut buf2) => {
                let n = result?;
                if n == 0 {
                    info!("Client 2 disconnected");
                    return Ok(());
                }

                let data = Bytes::copy_from_slice(&buf2[..n]);
                
                // Forward to client 1
                if let Err(e) = client1.write_all(&data).await {
                    warn!("Failed to forward to client 1: {}", e);
                    return Err(e);
                }

                // Broadcast to dashboard
                {
                    let mut hist = recv_history.write();
                    if hist.len() >= 100 {
                        hist.pop_front();
                    }
                    hist.push_back(data.clone());
                }
                let _ = tx_out.send(data);
            }
        }
    }
}


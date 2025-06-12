import React, { useContext, useEffect, useState } from "react";
import { Expr } from "../expr";
import BufferViewer from "../components/BufferViewer";
import { WebSocketContext } from "../contexts/WebSocketContext";
import { ReadyState } from "react-use-websocket";

interface HistoryPageProps {
  expr: Expr;
}

const HistoryPage: React.FC<HistoryPageProps> = ({ expr }) => {
  const { getWebSocket, readyState } = useContext(WebSocketContext);
  const [messages, setMessages] = useState<ArrayBuffer[]>([]);

  useEffect(() => {
    async function loadInitialHistory() {
      try {
        const res = await fetch("/api/history");
        const json = await res.json();
        const buffers: ArrayBuffer[] = json.map((entry: { data: string }) =>
          Uint8Array.from(atob(entry.data), c => c.charCodeAt(0)).buffer
        );
        setMessages(buffers.reverse());
      } catch (err) {
        console.error("Failed to load initial history:", err);
      }
    }

    loadInitialHistory();
  }, []);

  useEffect(() => {
    const ws = getWebSocket();
    if (!ws || readyState !== ReadyState.OPEN) return;

    const handleMessage = async (event: MessageEvent) => {
      if (event.data instanceof Blob) {
        const buffer = await event.data.arrayBuffer();
        setMessages(prev => [buffer, ...prev]);
      }
    };

    ws.addEventListener("message", handleMessage);
    return () => ws.removeEventListener("message", handleMessage);
  }, [getWebSocket, readyState]);

  return (
    <div className="history-page">
      <h2>Live Message History</h2>
      {readyState !== ReadyState.OPEN && (
        <div className="warning">WebSocket is not connected</div>
      )}
      <ul className="history-list">
        {messages.map((buffer, index) => (
          <li key={index} className="history-item">
            <BufferViewer
              bytes={buffer}
              expr={expr}
              valueType="Main"
            />
          </li>
        ))}
      </ul>
    </div>
  );
};

export default HistoryPage;

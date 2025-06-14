import React, { useEffect, useState } from "react";
import { Expr } from "../expr";
import BufferViewer from "../components/BufferViewer";
import { useWebSocketContext } from "../contexts/WebSocketContext";
import { ReadyState } from "react-use-websocket";

interface HistoryPageProps {
  expr: Expr;
}

const HistoryPage: React.FC<HistoryPageProps> = ({ expr }) => {
  const { getWebSocket, readyState } = useWebSocketContext();
  const [messages, setMessages] = useState<ArrayBuffer[]>([]);

  useEffect(() => {
    async function loadInitialHistory() {
      try {
        const res = await fetch("/api/history");
        const json = await res.json() as { data: string }[];
        const buffers: ArrayBuffer[] = json.map((entry: { data: string }) =>
          Uint8Array.from(atob(entry.data), c => c.charCodeAt(0)).buffer
        );
        setMessages(buffers.reverse());
      } catch (err) {
        console.error("Failed to load initial history:", err);
      }
    }

    void loadInitialHistory();
  }, []);

  useEffect(() => {
    const ws = getWebSocket();
    if (!ws || readyState !== ReadyState.OPEN) return;

    const handleMessage = function (this: WebSocket, event: Event): void {
      const messageEvent = event as MessageEvent;
      void (async () => {
        if (messageEvent.data instanceof Blob) {
          const buffer = await messageEvent.data.arrayBuffer();
          setMessages(prev => [buffer, ...prev]);
        }
      })();
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

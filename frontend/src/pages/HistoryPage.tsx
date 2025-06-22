import { JSX, useCallback, useEffect, useState } from "react";
import { Expr } from "../expr";
import BufferViewer from "../components/BufferViewer";
import { useWebSocketContext } from "../contexts/WebSocketContext";
import { ReadyState } from "react-use-websocket";
import { useOutletContext } from "react-router-dom";

import "./HistoryPage.css";

export default function HistoryPage() {
  const expr = useOutletContext<Expr>();
  const { getWebSocket, readyState } = useWebSocketContext();

  const [historyItems, setHistoryItems] = useState<JSX.Element[]>([]);

  const makeItem = useCallback(
    (buffer: ArrayBuffer, key: number) => (
      <li key={key} className="history-item">
        <BufferViewer bytes={buffer} expr={expr} valueType="Main" />
      </li>
    ),
    [expr]
  );

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/history");
        const json = (await res.json()) as { data: string }[];
        const buffers = json
          .map(e =>
            Uint8Array.from(atob(e.data), c => c.charCodeAt(0)).buffer
          )
          .reverse();

        const items = buffers.map(makeItem);

        setHistoryItems(items);
      } catch (err) {
        console.error("Failed to load initial history:", err);
      }
    })();
  }, [makeItem]);

  useEffect(() => {
    const ws = getWebSocket();
    if (!ws || readyState !== ReadyState.OPEN) return;

    const handler = (evt: Event) => {
      const ev = evt as MessageEvent;
      void (async () => {
        if (!(ev.data instanceof Blob)) return;
        const buf = await ev.data.arrayBuffer();

        setHistoryItems((prev: JSX.Element[]) => {
          const newKey = prev.length;
          const newItem = makeItem(buf, newKey);
          return [newItem, ...prev];
        });
      })();
    };

    ws.addEventListener("message", handler);
    return () => ws.removeEventListener("message", handler);
  }, [getWebSocket, readyState, makeItem]);

  return (
    <div className="history-page">
      <h2>Live Message History</h2>
      {readyState !== ReadyState.OPEN && (
        <div className="warning">WebSocket is not connected</div>
      )}
      <ul className="history-list">{historyItems}</ul>
    </div>
  );
}

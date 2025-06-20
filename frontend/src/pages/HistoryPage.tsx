import React, { useEffect, useState } from "react";
import { Expr } from "../expr";
import BufferViewer from "../components/BufferViewer";
import { useOutletContext } from "react-router-dom";


const HistoryPage: React.FC = () => {
  const expr = useOutletContext<Expr>();

  const [messages, setMessages] = useState<ArrayBuffer[]>([]);


  useEffect(() => {
    const es = new EventSource("/api/history");

    es.addEventListener("history", (e) => {
      try {
        const arr = JSON.parse(e.data as string) as string[];

        const initial = arr
          .map((b64) => {
            const bin = atob(b64);
            const buf = new ArrayBuffer(bin.length);
            const view = new Uint8Array(buf);
            for (let i = 0; i < bin.length; i++) {
              view[i] = bin.charCodeAt(i);
            }
            return buf;
          })
          .reverse();


        console.log(initial);

        setMessages(initial);
      } catch (err) {
        console.error("Failed to parse history event:", err);
      }
    });

    es.addEventListener("packet", (e) => {
      try {
        const bin = atob(e.data as string);
        const buf = new ArrayBuffer(bin.length);
        const view = new Uint8Array(buf);
        for (let i = 0; i < bin.length; i++) {
          view[i] = bin.charCodeAt(i);
        }
        setMessages((prev) => [buf, ...prev]);
      } catch (err) {
        console.error("Failed to parse packet event:", err);
      }
    });

    es.onerror = (err) => {
      console.error("SSE error", err);
    };

    return () => {
      es.close();
    };
  }, []);

  return (
    <div className="history-page">
      <h2>Live Message History</h2>
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

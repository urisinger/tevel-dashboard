import { createSignal, onMount, onCleanup, For } from "solid-js";
import BufferViewer from "../components/BufferViewer";
import { websocket } from "../state";
import { useExpr } from "../contexts/ExprContext";

export default function HistoryPage() {
  // history of buffers
  const [history, setHistory] = createSignal<ArrayBuffer[]>([]);

  // connection status
  const [isConnected, setIsConnected] = createSignal(
    websocket.readyState === WebSocket.OPEN
  );

  // load initial history once
  onMount(() => {
    fetch("/api/history")
      .then(res => res.json())
      .then(json => {
        const bufs = (json as { data: string }[])
          .map(e => Uint8Array.from(atob(e.data), c => c.charCodeAt(0)).buffer)
          .reverse();
        setHistory(bufs);
      })
      .catch(err => console.error("Failed to load initial history:", err));
  });

  onMount(() => {
    const onOpen = () => setIsConnected(true);
    const onClose = () => setIsConnected(false);
    const onMessage = (e: MessageEvent) => void (async () => {
      if (e.data instanceof Blob) {
        const buf = await e.data.arrayBuffer();
        setHistory(prev => [buf, ...prev]);
      }
    })();

    websocket.addEventListener("open", onOpen);
    websocket.addEventListener("close", onClose);
    websocket.addEventListener("message", onMessage);

    onCleanup(() => {
      websocket.removeEventListener("open", onOpen);
      websocket.removeEventListener("close", onClose);
      websocket.removeEventListener("message", onMessage);
    });
  });

  return (
    <div class="history-page">
      <h2>Live Message History</h2>
      {!isConnected() && (
        <div class="warning">WebSocket is not connected</div>
      )}
      <ul class="history-list">
        <For each={history()}>
          {buffer => (
            <li class="history-item">
              <BufferViewer bytes={buffer} expr={useExpr()} valueType="Main" />
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}

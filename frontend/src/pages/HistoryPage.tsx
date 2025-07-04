import { createSignal, createResource, onCleanup, For, Show } from "solid-js";
import BufferViewer from "../components/BufferViewer";
import { expr, websocket } from "../state";
import { Expr } from "../expr";

async function fetchHistory(): Promise<ArrayBuffer[]> {
  const res = await fetch("/api/history");
  const json = await res.json() as { data: string }[];
  return json
    .map(e => Uint8Array.from(atob(e.data), c => c.charCodeAt(0)).buffer)
    .reverse();
}

export default function HistoryPage() {
  const [isConnected, setIsConnected] = createSignal(
    websocket.readyState === WebSocket.OPEN
  );

  const [history, { mutate: setHistory }] = createResource(fetchHistory);

  const onOpen = () => setIsConnected(true);
  const onClose = () => setIsConnected(false);
  const onMessage = (e: MessageEvent) => void (async () => {
    if (e.data instanceof Blob) {
      const buf = await e.data.arrayBuffer();
      setHistory(prev => prev ? [buf, ...prev] : [buf]);
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

  return (
    <div class="history-page">
      <h2>Live Message History</h2>
      {!isConnected() && (
        <div class="warning">WebSocket is not connected</div>
      )}
      <Show when={!history.loading} fallback={<div class="loading">Loading history…</div>}>
        <Show when={!history.error} fallback={<div class="error">Failed to load history</div>}>
          <ul class="history-list">
            <For each={history() || []}>
              {buffer => (
                <li class="history-item">
                  <BufferViewer bytes={buffer} expr={expr() as Expr} valueType="Main" />
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </div>
  );
}

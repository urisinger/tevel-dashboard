import { JSX } from "solid-js";
import StructBuilder from "../components/StructBuilder";
import type { Expr, Value } from "../expr";
import { expr, websocket } from "../state";

export default function SendPage(): JSX.Element {
  const handleSubmit = (value: Value) => {
    try {
      const bytes = (expr() as Expr).encodeValue(value, "Main");
      websocket.send(bytes);
    } catch (e) {
      console.error("Failed to encode value:", e);
    }
  };

  return (
    <div class="send-page">
      <StructBuilder
        structName="Main"
        expr={expr() as Expr}
        isSocketReady={websocket.readyState === WebSocket.OPEN}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

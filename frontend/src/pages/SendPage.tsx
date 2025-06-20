import { JSX } from "solid-js";
import StructBuilder from "../components/StructBuilder";
import type { Value } from "../expr";
import { websocket } from "../state";
import { useExpr } from "../contexts/ExprContext";

export default function SendPage(): JSX.Element {
  const handleSubmit = (value: Value) => {
    try {
      const bytes = useExpr().encodeValue(value, "Main");
      websocket.send(bytes);
    } catch (e) {
      console.error("Failed to encode value:", e);
    }
  };

  return (
    <div class="send-page">
      <StructBuilder
        structName="Main"
        expr={useExpr()}
        // 1 (OPEN)
        isSocketReady={websocket.readyState === 1}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

// App.tsx
import React, { useState } from "react";
import { Expr } from "./expr";
import StructBuilder from "./StructBuilder";
import buildValueFromForm from "./buildValueFromForm";
import encodeValue from "./encodeValue";
import useWebSocket from "react-use-websocket";
import BufferViewer from "./BufferViewer";

interface AppProps {
  expr: Expr;
}

const App: React.FC<AppProps> = ({ expr}) => {
  const [selectedLayout, setSelectedLayout] = useState<string | null>(null);
  const [formData, setFormData] = useState<{ [key: string]: string }>({});
  const [encodedBuffer, setEncodedBuffer] = useState<string | null>(null);
  const { sendMessage, lastMessage, readyState } = useWebSocket("ws://localhost:8080", {
    protocols: ["websocket-to-tcp"],
    shouldReconnect: () => true, // Auto-reconnect on disconnect
  });

  const isSocketReady = readyState === 1; // Only allow submission if WebSocket is OPEN

  const onSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!selectedLayout) return;

    const layout = expr.layouts[selectedLayout];
    if (!layout) return;

    try {
      const value = buildValueFromForm(formData, layout, expr, "");
      const bytes = encodeValue(value);
      const encoded = Array.from(bytes, function(byte) {
        return ('0' + (byte & 0xFF).toString(16)).slice(-2);
      }).join(' ');
      sendMessage(bytes);
      setEncodedBuffer(encoded);
    } catch (e: any) {
      setEncodedBuffer(e.toString());
    }
  };


  
  return (
    <div style={{ padding: "20px" }}>
      <h1>Layout Builder</h1>
      <select
        onChange={(ev) => setSelectedLayout(ev.target.value)}
        defaultValue=""
      >
        <option value="">Select a Layout</option>
        {Object.keys(expr.layouts).map((key) => (
          <option key={key} value={key}>
            {key}
          </option>
        ))}
      </select>

      {selectedLayout && (
        <form onSubmit={onSubmit}>
          <StructBuilder
            structLayout={selectedLayout}
            expr={expr}
            formData={formData}
            setFormData={setFormData}
            prefix=""
          />
          <button type="submit" disabled={!isSocketReady}   style={{ cursor: !isSocketReady ? "default" : "pointer" }}>Submit</button>
        </form>
      )}

      {encodedBuffer && (
        <div>
          <h2>Encoded Buffer:</h2>
          <pre>{encodedBuffer}</pre>
        </div>
      )}

      {
      lastMessage && selectedLayout &&(
        <BufferViewer blob={lastMessage.data} expr={expr} valueType={selectedLayout}/>
      )}
    </div>
  );
};

export default App;

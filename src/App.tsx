import React, { useState } from "react";
import { Expr, Value } from "./expr";
import ValueForm from "./StructBuilder";
import useWebSocket, { ReadyState } from "react-use-websocket";
import BufferViewer from "./BufferViewer";

// Import the CSS files
import './App.css';
import './StructBuilder.css';
import './BufferViewer.css';

interface AppProps {
  expr: Expr;
}

const App: React.FC<AppProps> = ({ expr }) => {
  const [selectedLayout, setSelectedLayout] = useState<string | null>(null);
  
  const { sendMessage, lastMessage, readyState } = useWebSocket("ws://localhost:8080", {
    protocols: ["websocket-to-tcp"],
    shouldReconnect: () => true,
  });
  
  const isSocketReady = readyState === ReadyState.OPEN;
  
  const getConnectionStatusText = () => {
    switch (readyState) {
      case ReadyState.CONNECTING:
        return "Connecting...";
      case ReadyState.OPEN:
        return "Connected";
      case ReadyState.CLOSING:
        return "Closing...";
      case ReadyState.CLOSED:
        return "Disconnected";
      case ReadyState.UNINSTANTIATED:
        return "Uninstantiated";
      default:
        return "Unknown";
    }
  };

  const onSubmit = (value: Value) => {
    if (!selectedLayout) return;

    const layout = expr.get(selectedLayout);
    if (!layout) return;
    
    
    try {
      const bytes = expr.encodeValue(value);
      const encoded = Array.from(bytes, function(byte) {
        return ('0' + (byte & 0xFF).toString(16)).slice(-2);
      }).join(' ');
      
      sendMessage(bytes);
    } catch (e: any) {
      console.log(e);
    }
  };

  return (
    <div className="app-container">
      <div className="app-header">
        <h1 className="app-title">Data Structure Builder</h1>
        <p className="app-subtitle">Build and transmit binary data structures</p>
      </div>
      
      <div className="layout-selector-container">
        <select
          className="layout-selector"
          onChange={(ev) => {
            setSelectedLayout(ev.target.value);
          }}
          value={selectedLayout || ""}
        >
          <option value="">Select a Layout</option>
          {Array.from(expr.structs.keys()).map((key) => (
            <option key={key} value={key}>
              {key} ({expr.sizeof({kind: "Struct", name: key})} bytes)
            </option>
          ))}
        </select>
        
        <span className={`socket-status ${isSocketReady ? 'connected' : 'disconnected'}`}>
          <span className={`socket-status-indicator ${isSocketReady ? 'connected' : 'disconnected'}`}></span>
          WebSocket: {getConnectionStatusText()}
        </span>
      </div>
      
      <div className="main-content">
        <div className="form-panel">
          {selectedLayout && (
            <ValueForm
              structName={selectedLayout}
              expr={expr}
              isSocketReady={isSocketReady}
              onSubmit={onSubmit}
            />
          )}
        </div>
        
        <div className="viewer-panel">
          {lastMessage && selectedLayout && (
            <BufferViewer
              blob={lastMessage.data}
              expr={expr}
              valueType={selectedLayout}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default App;

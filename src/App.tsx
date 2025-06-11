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

  const mainType = { kind: "Struct" as const, name: "Main" };
  const minSize = expr.minSizeOf(mainType);
  const maxSize = expr.maxSizeOf(mainType);
  const sizeRange = minSize === maxSize ? `${minSize} bytes` : `${minSize}-${maxSize} bytes`;

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="sidebar-header">
          <h2>Dashboard</h2>
        </div>
        <div className="sidebar-content">
          <div className="sidebar-item active">
            <span>Main Screen</span>
          </div>
        </div>
      </div>
      
      <div className="main-content">
        <div className="app-header">
          <div className="header-top">
            <h1 className="app-title">Data Structure Builder</h1>
            <div className="size-info">
              <span className="size-label">Size:</span>
              <span className="size-value">{sizeRange}</span>
            </div>
          </div>
          <p className="app-subtitle">Build and transmit binary data structures</p>
          <span className={`socket-status ${isSocketReady ? 'connected' : 'disconnected'}`}>
            <span className={`socket-status-indicator ${isSocketReady ? 'connected' : 'disconnected'}`}></span>
            WebSocket: {getConnectionStatusText()}
          </span>
        </div>
        
        <div className="content-area">
          <div className="form-panel">
            <ValueForm
              structName="Main"
              expr={expr}
              isSocketReady={isSocketReady}
              onSubmit={onSubmit}
            />
          </div>
          
          <div className="viewer-panel">
            {lastMessage && (
              <BufferViewer
                blob={lastMessage.data}
                expr={expr}
                valueType="Main"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;

import React from 'react';
import { Expr, Value } from '../expr';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import StructBuilder from '../components/StructBuilder';
import { ReadyState } from 'react-use-websocket';
import { useOutletContext } from 'react-router-dom';


const SendPage: React.FC = () => {
  const expr = useOutletContext<Expr>();

  const { sendMessage, readyState } = useWebSocketContext();

  const handleSubmit = (value: Value) => {
    try {
      const bytes = expr.encodeValue(value, "Main");
      sendMessage(bytes);
    } catch (e) {
      console.error('Failed to encode value:', e);
    }
  };

  return (
    <div className="send-page">
      <StructBuilder
        structName="Main"
        expr={expr}
        isSocketReady={readyState === ReadyState.OPEN}
        onSubmit={handleSubmit}
      />
    </div >
  );
};

export default SendPage;

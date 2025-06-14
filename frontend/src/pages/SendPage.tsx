import React from 'react';
import { Expr } from '../expr';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import StructBuilder from '../components/StructBuilder';

interface SendPageProps {
  expr: Expr;
}

const SendPage: React.FC<SendPageProps> = ({ expr }) => {
  const { sendMessage, readyState } = useWebSocketContext();

  const handleSubmit = (value) => {
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
        isSocketReady={readyState === 1
        }
        onSubmit={handleSubmit}
      />
    </div >
  );
};

export default SendPage;

import React from 'react';
import { Expr, Value } from '../expr';
import StructBuilder from '../components/StructBuilder';
import { useOutletContext } from 'react-router-dom';


const SendPage: React.FC = () => {
  const expr = useOutletContext<Expr>();

  const handleSubmit = (value: Value) => {
    try {
      const buffer: ArrayBuffer = expr.encodeValue(value, "Main");
      const bytes = new Uint8Array(buffer);

      fetch("/api/send", {
        method: "POST",
        body: bytes,
      })
        .then(res => {
          if (!res.ok) {
            return res.text().then(text => {
              console.error("send failed:", res.status, text);
            });
          }
        })
        .catch(err => {
          console.error("Network or encode error:", err);
        });
    } catch (e) {
      console.error('Failed to encode value:', e);
    }
  };

  return (
    <div className="send-page">
      <StructBuilder
        structName="Main"
        expr={expr}
        onSubmit={handleSubmit}
      />
    </div >
  );
};

export default SendPage;

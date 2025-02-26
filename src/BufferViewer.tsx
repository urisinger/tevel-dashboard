import React, { useState, useEffect } from "react";
import { Expr, Value } from "./expr";

/**
 * React component that displays the decoded value from a Blob buffer.
 */
interface BufferViewerProps {
  blob: Blob;
  expr: Expr;
  valueType: string;
}

const BufferViewer: React.FC<BufferViewerProps> = ({ blob, expr, valueType }) => {
  const [decodedValue, setDecodedValue] = useState<Value | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const decodeBlob = async () => {
      try {
        const buffer = await blob.arrayBuffer(); // Convert Blob to ArrayBuffer
        const value = await expr.readValue(buffer, valueType);
        setDecodedValue(value);
      } catch (err) {
        setError(`Failed to decode: ${(err as Error).message}`);
      }
    };

    decodeBlob();
  }, [blob, expr, valueType]);

  return (
    <div>
      <h2>Decoded Value:</h2>
      {error ? (
        <div>
          <h3 style={{ color: "red" }}>Error Decoding Buffer</h3>
          <p>{error}</p>
        </div>
      ) : (
        <pre>{JSON.stringify(decodedValue, null, 2)}</pre>
      )}
    </div>
  );
};

export default BufferViewer;

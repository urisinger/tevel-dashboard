import React, { useEffect, useState } from "react";
import { Expr, Value, ValueMap } from "../expr";
import './BufferViewer.css';
import StructViewer from "./StructViewer";

interface BufferViewerProps {
  bytes: ArrayBuffer;
  expr: Expr;
  valueType: string;
}

const HexViewer: React.FC<{ data: ArrayBuffer }> = ({ data }) => {
  const bytesPerRow = 16;
  const byteArray = new Uint8Array(data);
  const rows: Uint8Array[] = [];

  for (let i = 0; i < byteArray.length; i += bytesPerRow) {
    rows.push(byteArray.slice(i, i + bytesPerRow));
  }

  return (
    <div className="hex-viewer">
      <div className="hex-header">
        <div className="offset-header">Offset</div>
        <div className="bytes-header">
          {Array.from({ length: bytesPerRow }, (_, i) => (
            <span key={i} className="byte-header">{i.toString(16).padStart(2, '0')}</span>
          ))}
        </div>
        <div className="ascii-header">ASCII</div>
      </div>

      {rows.map((row, rowIndex) => {
        const offset = rowIndex * bytesPerRow;

        return (
          <div key={rowIndex} className="hex-row">
            <div className="offset-cell">
              {offset.toString(16).padStart(8, '0')}
            </div>
            <div className="bytes-cell">
              {Array.from(row).map((byte, byteIndex) => (
                <span key={byteIndex} className="byte-value">
                  {byte.toString(16).padStart(2, '0')}
                </span>
              ))}
              {row.length < bytesPerRow &&
                Array.from({ length: bytesPerRow - row.length }, (_, i) => (
                  <span key={`empty-${i}`} className="byte-empty">{"  "}</span>
                ))}
            </div>
            <div className="ascii-cell">
              {Array.from(row).map((byte, byteIndex) => {
                const char = byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.';
                return <span key={byteIndex} className="ascii-char">{char}</span>;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};


// Main BufferViewer component
const BufferViewer: React.FC<BufferViewerProps> = ({
  bytes,
  expr,
  valueType
}) => {
  const [parsedValue, setParsedValue] = useState<Value | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState<'structured' | 'hex' | 'json'>('structured');

  useEffect(() => {
    try {
      // Reset states
      setError(undefined);
      setParsedValue(undefined);

      // Use the Expr to parse the buffer
      const value = expr.readValue(bytes, valueType);
      setParsedValue(value);


      if (!value) {
        setError(`Failed to parse buffer as ${valueType}`);
      }

    } catch (err) {
      setError(`Error parsing buffer: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [bytes, expr, valueType]);

  // Calculate size information
  const bufferSize = bytes.byteLength ? bytes.byteLength : 0;

  return (
    <div className="enhanced-buffer-viewer">
      <div className="viewer-header">
        <h2>Received Data</h2>
        <div className="buffer-info">
          <span className="info-item">
            <span className="info-label">Type:</span>
            <span className="info-value">{valueType}</span>
          </span>
          <span className="info-item">
            <span className="info-label">Size:</span>
            <span className="info-value">{bufferSize} bytes</span>
          </span>
        </div>
      </div>

      {error && (
        <div className="viewer-error">
          <div className="error-icon">⚠️</div>
          <div className="error-message">{error}</div>
        </div>
      )}

      <div className="viewer-tabs">
        <button
          className={`tab-button ${activeTab === 'structured' ? 'active' : ''}`}
          onClick={() => setActiveTab('structured')}
        >
          Structured View
        </button>
        <button
          className={`tab-button ${activeTab === 'hex' ? 'active' : ''}`}
          onClick={() => setActiveTab('hex')}
        >
          Hex View
        </button>
        <button
          className={`tab-button ${activeTab === 'json' ? 'active' : ''}`}
          onClick={() => setActiveTab('json')}
        >
          JSON View
        </button>
      </div>

      <div className="viewer-content">
        {activeTab === 'structured' && parsedValue && (
          <div className="structured-view">
            <StructViewer
              value={parsedValue as ValueMap}
              type={{ kind: "Struct", name: valueType }}
              expr={expr}
            />
          </div>
        )}

        {activeTab === 'hex' && (
          <div className="hex-view">
            <HexViewer data={bytes} />
          </div>
        )}

        {activeTab === 'json' && parsedValue && (
          <div className="json-view">
            <pre>
              {JSON.stringify(parsedValue, (_, value): unknown =>
                typeof value === 'bigint' ? value.toString() : value, 2)}
            </pre>
          </div>
        )}

        {!parsedValue && !error && (
          <div className="no-data">
            Waiting for data...
          </div>
        )}

      </div>
    </div>
  );
};

export default BufferViewer;

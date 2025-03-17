import React, { useEffect, useState } from "react";
import { Expr, Value } from "./expr";

interface BufferViewerProps {
  blob: Blob;
  expr: Expr;
  valueType: string;
}

// Component to visualize a struct value
const StructViewer: React.FC<{ value: Value; depth?: number }> = ({ 
  value, 
  depth = 0 
}) => {
  if (value.kind !== "Struct") {
    return <div className="error-message">Not a struct value</div>;
  }

  return (
    <div className={`struct-value ${depth === 0 ? 'root-struct' : ''}`}>
      {value.fields.map(([fieldName, fieldValue], index) => (
        <div key={index} className="struct-field-row">
          <div className="field-name">{fieldName}</div>
          <div className="field-value">
            {fieldValue.kind === "Struct" ? (
              <StructViewer value={fieldValue} depth={depth + 1} />
            ) : (
              <PrimitiveViewer value={fieldValue} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

// Component to visualize a primitive value
const PrimitiveViewer: React.FC<{ value: Value }> = ({ value }) => {
  if (value.kind === "Struct") {
    return <div className="error-message">Expected primitive, got struct</div>;
  }

  let displayValue: string;
  let typeClass: string;

  switch (value.kind) {
    case "I8":
    case "I16":
    case "I32":
      displayValue = value.value.toString();
      typeClass = "integer-value";
      break;
    case "I64":
      displayValue = value.value.toString();
      typeClass = "bigint-value";
      break;
    case "F32":
    case "F64":
      // Format floating point to 4 decimal places if needed
      displayValue = 
        value.value % 1 === 0 
          ? value.value.toString() 
          : value.value.toFixed(4);
      typeClass = "float-value";
      break;
    default:
      displayValue = "Unknown type";
      typeClass = "unknown-value";
  }

  return (
    <div className={`primitive-value ${typeClass}`}>
      <span className="value-content">{displayValue}</span>
      <span className="value-type">{value.kind}</span>
    </div>
  );
};

// Component to visualize hex data with byte highlighting
const HexViewer: React.FC<{ data: Uint8Array }> = ({ data }) => {
  const bytesPerRow = 16;
  const rows: Uint8Array[] = [];
  
  // Split data into rows
  for (let i = 0; i < data.length; i += bytesPerRow) {
    rows.push(data.slice(i, i + bytesPerRow));
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
              {/* Add empty spaces for incomplete rows */}
              {row.length < bytesPerRow && 
                Array.from({ length: bytesPerRow - row.length }, (_, i) => (
                  <span key={`empty-${i}`} className="byte-empty">
                    {"  "}
                  </span>
                ))
              }
            </div>
            <div className="ascii-cell">
              {Array.from(row).map((byte, byteIndex) => {
                // Show printable ASCII characters (32-126), replace others with a dot
                const char = byte >= 32 && byte <= 126 
                  ? String.fromCharCode(byte) 
                  : '.';
                return (
                  <span key={byteIndex} className="ascii-char">
                    {char}
                  </span>
                );
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
  blob, 
  expr, 
  valueType 
}) => {
  const [parsedValue, setParsedValue] = useState<Value | null>(null);
  const [rawBytes, setRawBytes] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'structured' | 'hex' | 'json'>('structured');

  useEffect(() => {
    const parseBuffer = async () => {
      try {
        // Reset states
        setError(null);
        setParsedValue(null);
        setRawBytes(null);
        
        // Convert Blob to ArrayBuffer
        const arrayBuffer = await blob.arrayBuffer();
        
        // Save raw bytes
        setRawBytes(new Uint8Array(arrayBuffer));
        
        // Use the Expr to parse the buffer
        const value = expr.readValue(arrayBuffer, valueType);
        setParsedValue(value);
        
        if (!value) {
          setError(`Failed to parse buffer as ${valueType}`);
        }
      } catch (err) {
        setError(`Error parsing buffer: ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    if (blob) {
      parseBuffer();
    }
  }, [blob, expr, valueType]);

  // Calculate size information
  const bufferSize = rawBytes ? rawBytes.length : 0;
  const expectedSize = valueType ? expr.sizeOf(valueType) : 0;

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
          {expectedSize !== undefined && (
            <span className="info-item">
              <span className="info-label">Expected Size:</span>
              <span className={`info-value ${bufferSize !== expectedSize ? 'size-mismatch' : ''}`}>
                {expectedSize} bytes
              </span>
            </span>
          )}
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
            <StructViewer value={parsedValue} />
          </div>
        )}
        
        {activeTab === 'hex' && rawBytes && (
          <div className="hex-view">
            <HexViewer data={rawBytes} />
          </div>
        )}
        
        {activeTab === 'json' && parsedValue && (
          <div className="json-view">
            <pre>
              {JSON.stringify(parsedValue, (key, value) => 
                typeof value === 'bigint' ? value.toString() : value, 2)}
            </pre>
          </div>
        )}
        
        {!parsedValue && !rawBytes && !error && (
          <div className="no-data">
            Waiting for data...
          </div>
        )}
      </div>
    </div>
  );
};

export default BufferViewer;
import { createSignal, createEffect, For, JSX, createMemo } from "solid-js";
import { Expr, Value, ValueMap, FieldType } from "../expr";
import StructViewer from "./StructViewer";

import "./BufferViewer.css";
import "./shared.css";


function HexViewer(props: { data: ArrayBuffer }): JSX.Element {
  const bytesPerRow = 16;

  const byteArray = createMemo(() => new Uint8Array(props.data));

  const rows = createMemo(() => {
    const arr = byteArray();
    const out: Uint8Array[] = [];
    for (let i = 0; i < arr.length; i += bytesPerRow) {
      out.push(arr.slice(i, i + bytesPerRow));
    }
    return out;
  });

  const headerIndices = Array.from({ length: bytesPerRow }, (_, i) => i);

  return (
    <div class="hex-viewer">
      <div class="hex-header">
        <div class="offset-header">Offset</div>
        <div class="bytes-header">
          <For each={headerIndices}>
            {(i) => (
              <span class="byte-header">
                {i.toString(16).padStart(2, "0")}
              </span>
            )}
          </For>
        </div>
        <div class="ascii-header">ASCII</div>
      </div>

      <For each={rows()}>
        {(row, rowIndex) => (
          <HexRow
            row={row}
            rowIndex={rowIndex()}
            bytesPerRow={bytesPerRow}
          />
        )}
      </For>
    </div>
  );
}

function HexRow(props: {
  row: Uint8Array;
  rowIndex: number;
  bytesPerRow: number;
}): JSX.Element {
  const offset = createMemo(() => props.rowIndex * props.bytesPerRow);
  const padding = createMemo(() => props.bytesPerRow - props.row.length);

  const byteList = createMemo(() => Array.from(props.row));

  return (
    <div class="hex-row">
      <div class="offset-cell">
        {offset().toString(16).padStart(8, "0")}
      </div>

      <div class="bytes-cell">
        <For each={byteList()}>
          {(byte: number) => (
            <span class="byte-value">
              {byte.toString(16).padStart(2, "0")}
            </span>
          )}
        </For>
        <For each={Array(padding()).fill(0)}>
          {() => <span class="byte-empty">{"  "}</span>}
        </For>
      </div>

      <div class="ascii-cell">
        <For each={byteList()}>
          {(byte: number) => {
            const char =
              byte >= 32 && byte <= 126
                ? String.fromCharCode(byte)
                : ".";
            return <span class="ascii-char">{char}</span>;
          }}
        </For>
      </div>
    </div>
  );
}


export default function BufferViewer(props: {
  bytes: ArrayBuffer;
  expr: Expr;
  valueType: string;
}): JSX.Element | null {
  const [parsedValue, setParsedValue] = createSignal<Value | undefined>();
  const [error, setError] = createSignal<string | undefined>();
  const [activeTab, setActiveTab] = createSignal<"structured" | "hex" | "json">(
    "structured"
  );

  createEffect(() => {
    setError(undefined);
    setParsedValue(undefined);
    try {
      const v = props.expr.decodeValue(props.bytes, props.valueType);
      if (!v) {
        setError(`Failed to parse buffer as ${props.valueType}`);
      }
      setParsedValue(v);
    } catch (err) {
      setError(
        `Error parsing buffer: ${err instanceof Error ? err.message : String(err)
        }`
      );
    }
  });

  const bufferSize = () => props.bytes.byteLength;

  return (
    <div class="enhanced-buffer-viewer">
      <div class="viewer-header">
        <h2>Received Data</h2>
        <div class="buffer-info">
          <span class="info-item">
            <span class="info-label">Type:</span>
            <span class="info-value">{props.valueType}</span>
          </span>
          <span class="info-item">
            <span class="info-label">Size:</span>
            <span class="info-value">{bufferSize()} bytes</span>
          </span>
        </div>
      </div>

      {error() && (
        <div class="viewer-error">
          <div class="error-icon">⚠️</div>
          <div class="error-message">{error()}</div>
        </div>
      )}

      <div class="viewer-tabs">
        <button
          class={`tab-button ${activeTab() === "structured" ? "active" : ""}`}
          onClick={() => setActiveTab("structured")}
        >
          Structured View
        </button>
        <button
          class={`tab-button ${activeTab() === "hex" ? "active" : ""}`}
          onClick={() => setActiveTab("hex")}
        >
          Hex View
        </button>
        <button
          class={`tab-button ${activeTab() === "json" ? "active" : ""}`}
          onClick={() => setActiveTab("json")}
        >
          JSON View
        </button>
      </div>

      <div class="viewer-content">
        {activeTab() === "structured" && parsedValue() !== undefined && (
          <div class="structured-view">
            <StructViewer
              value={parsedValue() as ValueMap}
              type={{ kind: "Struct", name: props.valueType } as FieldType}
              expr={props.expr}
            />
          </div>
        )}

        {activeTab() === "hex" && (
          <div class="hex-view">
            <HexViewer data={props.bytes} />
          </div>
        )}

        {activeTab() === "json" && parsedValue() !== undefined && (
          <div class="json-view">
            <pre>
              {JSON.stringify(parsedValue())}
            </pre>
          </div>
        )}

        {!parsedValue() && !error() && (
          <div class="no-data">Waiting for data...</div>
        )}
      </div>
    </div>
  );
}

import { createSignal, createMemo, Show } from "solid-js";
import BufferViewer from "../components/BufferViewer";
import { expr } from "../state";
import { Expr } from "../expr";
import "./DataViewerPage.css";

export default function CustomBytesPage() {
  const [inputType, setInputType] = createSignal<"hex" | "decimal" | "ascii">("hex");
  const [inputValue, setInputValue] = createSignal("");
  const [error, setError] = createSignal<string | undefined>();

  const buffer = createMemo(() => {
    if (!inputValue().trim()) return undefined;
    
    try {
      setError(undefined);
      
      switch (inputType()) {
        case "hex":
          return parseHexInput(inputValue());
        case "decimal":
          return parseDecimalInput(inputValue());
        case "ascii":
          return parseAsciiInput(inputValue());
        default:
          return undefined;
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(`Failed to parse input: ${errorMsg}`);
      return undefined;
    }
  });

  function parseHexInput(hex: string): ArrayBuffer {
    // Remove spaces, commas, and other separators
    const cleanHex = hex.replace(/[,\s]/g, "");
    
    // Ensure even length
    if (cleanHex.length % 2 !== 0) {
      throw new Error("Hex string must have even number of characters");
    }
    
    // Validate hex characters
    if (!/^[0-9a-fA-F]+$/.test(cleanHex)) {
      throw new Error("Invalid hex characters detected");
    }
    
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < cleanHex.length; i += 2) {
      bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
    }
    
    return bytes.buffer;
  }

  function parseDecimalInput(decimal: string): ArrayBuffer {
    // Split by spaces, commas, or other separators
    const numbers = decimal.split(/[,\s]+/).filter(s => s.trim());
    
    if (numbers.length === 0) {
      throw new Error("No valid numbers found");
    }
    
    const bytes = new Uint8Array(numbers.length);
    for (let i = 0; i < numbers.length; i++) {
      const num = parseInt(numbers[i].trim());
      if (isNaN(num) || num < 0 || num > 255) {
        throw new Error(`Invalid byte value: ${numbers[i]} (must be 0-255)`);
      }
      bytes[i] = num;
    }
    
    return bytes.buffer;
  }

  function parseAsciiInput(ascii: string): ArrayBuffer {
    const encoder = new TextEncoder();
    return encoder.encode(ascii).buffer;
  }

  function clearInput() {
    setInputValue("");
    setError(undefined);
  }

  return (
    <div class="data-viewer-page">
      <h2>Data Viewer</h2>
      <p class="page-description">
        Input bytes in various formats and view them using the structured parser
      </p>

      <div class="input-section">
        <div class="input-controls">
          <div class="input-type-selector">
            <label for="input-type">Input Format:</label>
            <select
              id="input-type"
              value={inputType()}
              onChange={(e) => setInputType(e.currentTarget.value as "hex" | "decimal" | "ascii")}
            >
              <option value="hex">Hexadecimal</option>
              <option value="decimal">Decimal</option>
              <option value="ascii">ASCII Text</option>
            </select>
          </div>
          
          <button
            class="clear-button"
            onClick={clearInput}
            disabled={!inputValue()}
          >
            Clear
          </button>
        </div>

        <div class="input-field">
          <label for="bytes-input">Bytes:</label>
          <textarea
            id="bytes-input"
            value={inputValue()}
            onInput={(e) => setInputValue(e.currentTarget.value)}
            placeholder={
              inputType() === "hex" ? "Enter hex values (e.g., 48 65 6C 6C 6F)"
              : inputType() === "decimal" ? "Enter decimal values (e.g., 72 101 108 108 111)"
              : "Enter ASCII text (e.g., Hello World)"
            }
            rows={4}
          />
        </div>

        {error() && (
          <div class="input-error">
            <div class="error-icon">⚠️</div>
            <div class="error-message">{error()}</div>
          </div>
        )}
      </div>

      <Show when={buffer() && !error()}>
        <div class="viewer-section">
          <BufferViewer 
            bytes={buffer()!} 
            expr={expr() as Expr} 
            valueType="Main" 
          />
        </div>
      </Show>

      <Show when={!buffer() && !error() && !inputValue()}>
        <div class="empty-state">
          <div class="empty-icon">📝</div>
          <h3>Enter bytes to get started</h3>
          <p>Choose your input format and enter some bytes to see them parsed and displayed.</p>
        </div>
      </Show>
    </div>
  );
}

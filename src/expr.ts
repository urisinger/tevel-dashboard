import grammer from "./grammer.pegjs?raw";
import peg from "peggy";

// Generate the parser from the grammar
export const parser = peg.generate(grammer);

// Define our types
export type FieldType =
  | { kind: "Struct"; name: string }
  | { kind: "I8" }
  | { kind: "I16" }
  | { kind: "I32" }
  | { kind: "I64" }
  | { kind: "F32" }
  | { kind: "F64" };

export interface Struct {
  fields: [string, FieldType][];
}

export type Value =
  | { kind: "I8"; value: number }
  | { kind: "I16"; value: number }
  | { kind: "I32"; value: number }
  | { kind: "I64"; value: bigint }
  | { kind: "F32"; value: number }
  | { kind: "F64"; value: number }
  | { kind: "Struct"; fields: [string, Value][] };

export class Expr {
  // Instead of an array, we use an object mapping struct names to their definitions.
  layouts: { [name: string]: Struct };

  constructor(layouts: { [name: string]: Struct }) {
    this.layouts = layouts;
  }

  /**
   * Recursively computes the size (in bytes) of the layout with the given name.
   */
  sizeOf(name: string): number | undefined {
    const layout = this.layouts[name];
    if (!layout) return undefined;

    let total = 0;
    for (const [, type] of layout.fields) {
      let fieldSize: number | undefined;
      switch (type.kind) {
        case "I8":
          fieldSize = 1;
          break;
        case "I16":
          fieldSize = 2;
          break;
        case "I32":
          fieldSize = 4;
          break;
        case "I64":
          fieldSize = 8;
          break;
        case "F32":
          fieldSize = 4;
          break;
        case "F64":
          fieldSize = 8;
          break;
        case "Struct":
          fieldSize = this.sizeOf(type.name);
          break;
      }
      if (fieldSize === undefined) return undefined;
      total += fieldSize;
    }
    return total;
  }

  /**
   * Get the struct (layout) for a given name.
   */
  get(name: string): Struct | undefined {
    return this.layouts[name];
  }

  /**
   * Reads a value from the given Uint8Array buffer according to the layout name.
   */
  readValue(buf: Uint8Array, layoutName: string): Value | undefined {
    const result = this.readValueHelper(buf, layoutName);
    return result ? result[0] : undefined;
  }

  /**
   * Helper method that reads a value from the buffer and returns a tuple with the Value and the number of bytes read.
   */
  private readValueHelper(buf: Uint8Array, layoutName: string): [Value, number] | undefined {
    const layout = this.get(layoutName);
    if (!layout) return undefined;

    let offset = 0;
    const fields: [string, Value][] = [];
    const dataView = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

    for (const [fieldName, type] of layout.fields) {
      let value: Value;
      switch (type.kind) {
        case "I8": {
          if (offset + 1 > buf.length) return undefined;
          const v = dataView.getInt8(offset);
          offset += 1;
          value = { kind: "I8", value: v };
          break;
        }
        case "I16": {
          if (offset + 2 > buf.length) return undefined;
          const v = dataView.getInt16(offset, true);
          offset += 2;
          value = { kind: "I16", value: v };
          break;
        }
        case "I32": {
          if (offset + 4 > buf.length) return undefined;
          const v = dataView.getInt32(offset, true);
          offset += 4;
          value = { kind: "I32", value: v };
          break;
        }
        case "I64": {
          if (offset + 8 > buf.length) return undefined;
          const v = dataView.getBigInt64(offset, true);
          offset += 8;
          value = { kind: "I64", value: v };
          break;
        }
        case "F32": {
          if (offset + 4 > buf.length) return undefined;
          const v = dataView.getFloat32(offset, true);
          offset += 4;
          value = { kind: "F32", value: v };
          break;
        }
        case "F64": {
          if (offset + 8 > buf.length) return undefined;
          const v = dataView.getFloat64(offset, true);
          offset += 8;
          value = { kind: "F64", value: v };
          break;
        }
        case "Struct": {
          const subBuf = buf.subarray(offset);
          const result = this.readValueHelper(subBuf, type.name);
          if (!result) return undefined;
          const [subValue, consumed] = result;
          value = subValue;
          offset += consumed;
          break;
        }
      }
      fields.push([fieldName, value]);
    }
    return [{ kind: "Struct", fields }, offset];
  }
}
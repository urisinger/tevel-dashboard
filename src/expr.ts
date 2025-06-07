import peg from "peggy";
import grammar from "./grammer.pegjs?raw";

const parser = peg.generate(grammar);

export type FieldType =
  | { kind: "Struct"; name: string }
  | { kind: "Enum"; name: string; base: "I8" | "I16" | "I32" | "I64" }
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
  | { kind: "Enum"; name: string; base: "I8" | "I16" | "I32" | "I64"; value: string }
  | { kind: "Struct"; name: string; fields: Map<string, Value> };

export class Expr {
  structs: Map<string, Struct>;
  enums: Map<string, Map<string, number>>;

  constructor(structs: Map<string, Struct>, enums: Map<string, Map<string, number>> = new Map()) {
    this.structs = structs;
    this.enums = enums;
  }

  static parse(input: string): Expr {
    const parsed = parser.parse(input) as Array<
      | { type: "struct"; name: string; fields: [string, string | { enum: string; kind: string }][] }
      | { type: "enum"; name: string; entries: [string, number][] }
    >;

    const structs = new Map<string, Struct>();
    const enums = new Map<string, Map<string, number>>();

    for (const def of parsed) {
      if (def.type === "struct") {
        const fields: [string, FieldType][] = def.fields.map(([name, typeInfo]) => {
          if (typeof typeInfo === "string") {
            switch (typeInfo) {
              case "i8": return [name, { kind: "I8" }];
              case "i16": return [name, { kind: "I16" }];
              case "i32": return [name, { kind: "I32" }];
              case "i64": return [name, { kind: "I64" }];
              case "f32": return [name, { kind: "F32" }];
              case "f64": return [name, { kind: "F64" }];
              default: return [name, { kind: "Struct", name: typeInfo }];
            }
          } else {
            const baseKind = typeInfo.kind.toUpperCase() as "I8" | "I16" | "I32" | "I64";
            return [name, { kind: "Enum", name: typeInfo.enum, base: baseKind }];
          }
        });
        structs.set(def.name, { fields });
      } else {
        enums.set(def.name, new Map(def.entries));
      }
    }

    return new Expr(structs, enums);
  }

  get(name: string): Struct | undefined {
    return this.structs.get(name);
  }

  getEnum(name: string): Map<string, number> | undefined {
    return this.enums.get(name);
  }

  sizeof(name: string): number {
    const struct = this.get(name);
    if (!struct) throw new Error(`Unknown struct: ${name}`);
    return struct.fields.reduce((sum, [, t]) => sum + this.sizeOfType(t), 0);
  }

  sizeOfType(type: FieldType): number {
    switch (type.kind) {
      case "I8": return 1;
      case "I16": return 2;
      case "I32": return 4;
      case "I64": return 8;
      case "F32": return 4;
      case "F64": return 8;
      case "Enum": return this.sizeOfType({ kind: type.base });
      case "Struct": {
        const struct = this.get(type.name);
        if (!struct) throw new Error(`Unknown struct: ${type.name}`);
        return struct.fields.reduce((sum, [, t]) => sum + this.sizeOfType(t), 0);
      }
    }
  }

  sizeOfValue(value: Value): number {
    switch (value.kind) {
      case "I8": return 1;
      case "I16": return 2;
      case "I32": return 4;
      case "I64": return 8;
      case "F32": return 4;
      case "F64": return 8;
      case "Enum": return this.sizeOfType({ kind: value.base });
      case "Struct": return Array.from(value.fields).reduce((sum, [, v]) => sum + this.sizeOfValue(v), 0);
    }
  }

  encodeValue(value: Value): Uint8Array {
    const buf = new Uint8Array(this.sizeOfValue(value));
    const written = this.writeValue(value, buf);
    if (written !== buf.length) {
      console.warn(`Expected to write ${buf.length} bytes, but wrote ${written}`);
    }
    return buf;
  }

  writeValue(value: Value, buf: Uint8Array): number {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let offset = 0;

    const writeInt = (val: number | bigint, size: number) => {
      switch (size) {
        case 1: dv.setInt8(offset, Number(val)); break;
        case 2: dv.setInt16(offset, Number(val), true); break;
        case 4: dv.setInt32(offset, Number(val), true); break;
        case 8: dv.setBigInt64(offset, BigInt(val), true); break;
      }
      offset += size;
    };

    switch (value.kind) {
      case "I8": writeInt(value.value, 1); break;
      case "I16": writeInt(value.value, 2); break;
      case "I32": writeInt(value.value, 4); break;
      case "I64": writeInt(value.value, 8); break;
      case "F32": dv.setFloat32(offset, value.value, true); offset += 4; break;
      case "F64": dv.setFloat64(offset, value.value, true); offset += 8; break;
      case "Enum": {
        const enumMap = this.getEnum(value.name);
        if (!enumMap) throw new Error(`Enum '${value.name}' not found`);
        const num = enumMap.get(value.value);
        if (num === undefined) throw new Error(`Enum value '${value.value}' not found`);
        writeInt(num, this.sizeOfType({ kind: value.base }));
        break;
      }
      case "Struct": {
        const struct = this.get(value.name);
        if (!struct) throw new Error(`Unknown struct: ${value.name}`);
        
        // Write fields in the order defined by the struct
        for (const [fieldName, fieldType] of struct.fields) {
          const fieldValue = value.fields.get(fieldName);
          if (!fieldValue) throw new Error(`Missing field ${fieldName} in struct ${value.name}`);
          offset += this.writeValue(fieldValue, buf.subarray(offset));
        }
        break;
      }
    }

    return offset;
  }

  readValue(buf: ArrayBuffer, layoutName: string): Value | null {
    const result = this.readValueHelper(buf, layoutName);
    return result ? result[0] : null;
  }

  private readValueHelper(buf: ArrayBuffer, layoutName: string): [Value, number] | null {
    const struct = this.get(layoutName);
    if (!struct) return null;

    let offset = 0;
    const fields: Map<string, Value> = new Map();
    const dv = new DataView(buf);

    for (const [fieldName, type] of struct.fields) {
      let value: Value;

      const readInt = (size: number): number | bigint => {
        switch (size) {
          case 1: return dv.getInt8(offset);
          case 2: return dv.getInt16(offset, true);
          case 4: return dv.getInt32(offset, true);
          case 8: return dv.getBigInt64(offset, true);
          default: throw new Error(`Invalid int size: ${size}`);
        }
      };

      switch (type.kind) {
        case "I8": value = { kind: "I8", value: dv.getInt8(offset) }; offset += 1; break;
        case "I16": value = { kind: "I16", value: dv.getInt16(offset, true) }; offset += 2; break;
        case "I32": value = { kind: "I32", value: dv.getInt32(offset, true) }; offset += 4; break;
        case "I64": value = { kind: "I64", value: dv.getBigInt64(offset, true) }; offset += 8; break;
        case "F32": value = { kind: "F32", value: dv.getFloat32(offset, true) }; offset += 4; break;
        case "F64": value = { kind: "F64", value: dv.getFloat64(offset, true) }; offset += 8; break;
        case "Enum": {
          const enumMap = this.getEnum(type.name);
          if (!enumMap) return null;
          const size = this.sizeOfType({ kind: type.base });
          const raw = readInt(size);
          offset += size;

          const match = [...enumMap.entries()].find(([, num]) =>
            typeof raw === "bigint" ? BigInt(num) === raw : num === raw
          );

          value = {
            kind: "Enum",
            name: type.name,
            base: type.base,
            value: match?.[0] ?? "UNKNOWN"
          };
          break;
        }
        case "Struct": {
          const subBuf = buf.slice(offset);
          const sub = this.readValueHelper(subBuf, type.name);
          if (!sub) return null;
          const [val, consumed] = sub;
          value = val;
          offset += consumed;
          break;
        }
      }

      fields.set(fieldName, value);
    }

    return [{ kind: "Struct", name: layoutName, fields }, offset];
  }
}
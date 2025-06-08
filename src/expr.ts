import peg from "peggy";
import grammar from "./grammer.pegjs?raw";

const parser = peg.generate(grammar);

export type FieldType =
  | { kind: "Struct"; name: string }
  | { kind: "Enum"; name: string; base: "i8" | "i16" | "i32" | "i64" }
  | {kind: "Match", discriminant: string; cases: Map<string, FieldType> }
  | { kind: "i8" }
  | { kind: "i16" }
  | { kind: "i32" }
  | { kind: "i64" }
  | { kind: "f32" }
  | { kind: "f64" };

export interface Struct {
  fields: [string, FieldType][];
}

export type Value =
  | { kind: "i8"; value: number }
  | { kind: "i16"; value: number }
  | { kind: "i32"; value: number }
  | { kind: "i64"; value: bigint }
  | { kind: "f32"; value: number }
  | { kind: "f64"; value: number }
  | { kind: "Enum"; name: string; base: "i8" | "i16" | "i32" | "i64"; value: string }
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
    | { type: "struct"; name: string; fields: [string, FieldType][] }
    | { type: "enum"; name: string; entries: [string, number][] }
  >;

  const structs = new Map<string, Struct>();
  const enums = new Map<string, Map<string, number>>();

  for (const def of parsed) {
    if (def.type === "struct") {
      structs.set(def.name, { fields: def.fields });
    } else if (def.type === "enum") {
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
    return struct.fields.reduce((sum, [, t]) => {const size = this.sizeOfType(t);return sum + size;}, 0);
  }

sizeOfType(type: FieldType): number {
  switch (type.kind) {
    case "i8": return 1;
    case "i16": return 2;
    case "i32": return 4;
    case "i64": return 8;
    case "f32": return 4;
    case "f64": return 8;

    case "Enum":
      return this.sizeOfType({ kind: type.base });

    case "Struct": {
      const struct = this.get(type.name);

      if (!struct) throw new Error(`Unknown struct: ${type.name}`);
      return struct.fields.reduce((sum, [, t]) => {const size = this.sizeOfType(t); return sum + size;}, 0);
    }

    case "Match": {
      let maxSize = 0;
      for (const variantType of type.cases.values()) {
        const size = this.sizeOfType(variantType);
        maxSize = Math.max(maxSize, size);
      }
      return maxSize;
    }
  }
}


  sizeOfValue(value: Value): number {
    switch (value.kind) {
      case "i8": return 1;
      case "i16": return 2;
      case "i32": return 4;
      case "i64": return 8;
      case "f32": return 4;
      case "f64": return 8;
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
      case "i8": writeInt(value.value, 1); break;
      case "i16": writeInt(value.value, 2); break;
      case "i32": writeInt(value.value, 4); break;
      case "i64": writeInt(value.value, 8); break;
      case "f32": dv.setFloat32(offset, value.value, true); offset += 4; break;
      case "f64": dv.setFloat64(offset, value.value, true); offset += 8; break;
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

  defaultValue(type: FieldType): Value {
    switch (type.kind) {
      case "i8": return { kind: "i8", value: 0 };
      case "i16": return { kind: "i16", value: 0 };
      case "i32": return { kind: "i32", value: 0 };
      case "i64": return { kind: "i64", value: BigInt(0) };
      case "f32": return { kind: "f32", value: 0 };
      case "f64": return { kind: "f64", value: 0 };

      case "Enum": {
        const enumDef = this.getEnum(type.name);
        if (!enumDef || enumDef.size === 0) {
          throw new Error(`Enum '${type.name}' not found or is empty`);
        }
        const firstValue = Array.from(enumDef.keys())[0];
        return {
          kind: "Enum",
          name: type.name,
          base: type.base,
          value: firstValue,
        };
      }

      case "Struct":
        return this.defaultStructValue(type.name);

      case "Match":
        throw new Error(
          `defaultValue(type: Match) must be resolved in a struct context using defaultStructValue()`
        );
    }
  }

  defaultStructValue(structName: string): Value {
    const struct = this.get(structName);
    if (!struct) throw new Error(`Struct '${structName}' not found`);

    const fields = new Map<string, Value>();

    // First pass: set simple fields and Enums
    for (const [name, type] of struct.fields) {
      if (type.kind !== "Match") {
        fields.set(name, this.defaultValue(type));
      }
    }

    // Second pass: resolve Match fields using the Enum discriminant
    for (const [name, type] of struct.fields) {
      if (type.kind === "Match") {
        const discrim = fields.get(type.discriminant);
        if (!discrim || discrim.kind !== "Enum") {
          throw new Error(`Missing or invalid discriminant for match field '${name}'`);
        }

        const variantType = type.cases.get(discrim.value);
        if (!variantType) {
          throw new Error(`No case in match for discriminant value '${discrim.value}'`);
        }

        const matchValue = this.defaultValue(variantType);
        fields.set(name, matchValue);
      }
    }

    return { kind: "Struct", name: structName, fields };
  }



  private readByType(buf: ArrayBuffer, type: FieldType): [Value, number] | null {
    const dv = new DataView(buf);
  
    const readInt = (size: number): number | bigint => {
      switch (size) {
        case 1: return dv.getInt8(0);
        case 2: return dv.getInt16(0, true);
        case 4: return dv.getInt32(0, true);
        case 8: return dv.getBigInt64(0, true);
        default: throw new Error(`Invalid int size: ${size}`);
      }
    };
  
    switch (type.kind) {
      case "i8": return [{ kind: "i8", value: dv.getInt8(0) }, 1];
      case "i16": return [{ kind: "i16", value: dv.getInt16(0, true) }, 2];
      case "i32": return [{ kind: "i32", value: dv.getInt32(0, true) }, 4];
      case "i64": return [{ kind: "i64", value: dv.getBigInt64(0, true) }, 8];
      case "f32": return [{ kind: "f32", value: dv.getFloat32(0, true) }, 4];
      case "f64": return [{ kind: "f64", value: dv.getFloat64(0, true) }, 8];
      case "Enum": {
        const enumMap = this.getEnum(type.name);
        if (!enumMap) return null;
        const size = this.sizeOfType({ kind: type.base });
        const raw = readInt(size);
        const entry = [...enumMap.entries()].find(([, num]) => typeof raw === "bigint" ? BigInt(num) === raw : num === raw);
        return [{
          kind: "Enum",
          name: type.name,
          base: type.base,
          value: entry?.[0] ?? "UNKNOWN"
        }, size];
      }
      case "Struct": {
        const res = this.readValueHelper(buf, type.name);
        return res;
      }
      default: return null;
    }
  }
  
  private readValueHelper(buf: ArrayBuffer, layoutName: string): [Value, number] | null {
    const struct = this.get(layoutName);
    if (!struct) return null;
  
    let offset = 0;
    const fields: Map<string, Value> = new Map();
  
    for (const [fieldName, type] of struct.fields) {
      let value: Value;

      console.debug(`name: ${fieldName} offset: ${offset} len: {}`);

    
      if (type.kind === "Match") {
        const discrimVal = fields.get(type.discriminant);
        if (!discrimVal || discrimVal.kind !== "Enum") {
          throw new Error(`Discriminant '${type.discriminant}' not available or not Enum`);
        }
        const caseType = type.cases.get(discrimVal.value);
        if (!caseType) throw new Error(`No match case for '${discrimVal.value}'`);
        const subBuf = buf.slice(offset);
        const result = this.readByType(subBuf, caseType);
        if (!result) return null;
        result[1] += offset;
        [value, offset] = result;
      } else {
        const result = this.readByType(buf.slice(offset), type);
        if (!result) return null;
        result[1] += offset;
        [value, offset] = result;
      }
    
      fields.set(fieldName, value);
    }
  
    return [{ kind: "Struct", name: layoutName, fields }, offset];
  }
}
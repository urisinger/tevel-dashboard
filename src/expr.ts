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

  /**
   * Returns the maximun size (in bytes) of `type`.
   * – If you also pass a partially‑filled `value`, the exact size of the data
   *   in that value is used for Match/Struct discrimination.
   * – If a field is missing, or you don’t supply a value at all, it falls back
   *   to the *maximum* size for that field‑type.
   */
  sizeof(
    type: FieldType,
    value?: Value,
    parentFields: Map<string, Value> | null = null
  ): number {
    switch (type.kind) {
      // ── primitives ─────────────────────────────
      case "i8":  return 1;
      case "i16": return 2;
      case "i32": return 4;
      case "i64": return 8;
      case "f32": return 4;
      case "f64": return 8;

      // ── enum  (size depends only on base) ──────
      case "Enum":
        return this.sizeof({ kind: type.base });

      // ── struct  (iterates declared fields) ─────
      case "Struct": {
        const struct = this.get(type.name);
        if (!struct) throw new Error(`Unknown struct '${type.name}'`);

        // If we *do* have a matching Value, expose its field‑map to children
        const fieldMap =
          value?.kind === "Struct" && value.name === type.name
            ? value.fields
            : null;

        let total = 0;
        for (const [fieldName, fieldType] of struct.fields) {
          const fieldVal = fieldMap?.get(fieldName);
          total += this.sizeof(
            fieldType,
            fieldVal,
            fieldMap                        // pass down for Match resolution
          );
        }
        return total;
      }

      // ── match  (resolve by discriminant, else worst‑case) ──────────
      case "Match": {
        // 1. If we have parentFields → look up discriminant Enum
        const discrVal = parentFields?.get(type.discriminant);
        if (discrVal?.kind === "Enum") {
          const caseType = type.cases.get(discrVal.value);
          if (!caseType)
            throw new Error(
              `No case in match for enum value '${discrVal.value}'`
            );
          const innerVal = (value?.kind !== "Struct") ? value : undefined;
          return this.sizeof(caseType, innerVal, parentFields);
        }

        // 2. Otherwise (or discriminant missing) → return **max** case size
        let max = 0;
        for (const ct of type.cases.values()) {
          max = Math.max(max, this.sizeof(ct, undefined, parentFields));
        }
        return max;
      }
    }
  }


encodeValue(value: Value): Uint8Array {
  // start small; will grow automatically
  let buf   = new Uint8Array(32);
  let bytes = this.writeValueHelper(value, buf, 0);

  // slice to exact length
  return buf.subarray(0, bytes);
}


  writeValueHelper(
  value: Value,
  buf: Uint8Array,
  offset: number
): number /* new offset */ {
  // helper that ensures capacity
  const need = (n: number) => {
    if (offset + n > buf.length) {
      const bigger = new Uint8Array(Math.max(buf.length * 2, offset + n));
      bigger.set(buf);
      buf = bigger;                               // replace closed‑over ref
    }
  };

  const dv = new DataView(buf.buffer);

  const putInt = (val: number | bigint, size: 1 | 2 | 4 | 8) => {
    need(size);
    switch (size) {
      case 1: dv.setInt8 (offset, Number(val));           break;
      case 2: dv.setInt16(offset, Number(val), true);     break;
      case 4: dv.setInt32(offset, Number(val), true);     break;
      case 8: dv.setBigInt64(offset, BigInt(val), true);  break;
    }
    offset += size;
  };

  switch (value.kind) {
    case "i8":  putInt(value.value, 1); break;
    case "i16": putInt(value.value, 2); break;
    case "i32": putInt(value.value, 4); break;
    case "i64": putInt(value.value, 8); break;
    case "f32": need(4); dv.setFloat32(offset, value.value, true); offset += 4; break;
    case "f64": need(8); dv.setFloat64(offset, value.value, true); offset += 8; break;

    case "Enum": {
      const enumMap = this.getEnum(value.name);
      if (!enumMap) throw new Error(`Enum '${value.name}' not found`);
      const num = enumMap.get(value.value);
      if (num === undefined) throw new Error(`Enum variant '${value.value}' not found`);
      putInt(num, this.sizeof({ kind: value.base }) as 1 | 2 | 4 | 8);
      break;
    }

    case "Struct": {
      const struct = this.get(value.name);
      if (!struct) throw new Error(`Unknown struct '${value.name}'`);

      for (const [fname, ftype] of struct.fields) {
        const fval = value.fields.get(fname) ?? this.defaultValue(ftype, value.fields);
        offset = this.writeValueHelper(fval, buf, offset); // may grow & return new offset
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

defaultValue(
  type: FieldType,
  parentFields: Map<string, Value> | null = null
): Value {
  switch (type.kind) {
    case "i8":  return { kind: "i8",  value: 0 };
    case "i16": return { kind: "i16", value: 0 };
    case "i32": return { kind: "i32", value: 0 };
    case "i64": return { kind: "i64", value: 0n };
    case "f32": return { kind: "f32", value: 0 };
    case "f64": return { kind: "f64", value: 0 };

    case "Enum": {
      const enumDef = this.getEnum(type.name);
      if (!enumDef || enumDef.size === 0)
        throw new Error(`Enum '${type.name}' not found or empty`);
      const firstKey = Array.from(enumDef.keys())[0];
      return { kind: "Enum", name: type.name, base: type.base, value: firstKey };
    }

    case "Struct": {
      const struct = this.get(type.name);
      if (!struct) throw new Error(`Struct '${type.name}' not found`);

      const fields = new Map<string, Value>();

      for (const [fieldName, fieldType] of struct.fields) {
        const fieldVal =
            this.defaultValue(fieldType, fields) ;
        fields.set(fieldName, fieldVal);
      }

      return { kind: "Struct", name: type.name, fields };
    }

    case "Match": {
      const discr = parentFields?.get(type.discriminant);
      const key =
        discr?.kind === "Enum"
          ? discr.value
          : Array.from(type.cases.keys())[0]; // fallback to first entry
      const variantType = type.cases.get(key);
      if (!variantType)
        throw new Error(
          `No variant in match '${type.discriminant}' for enum value '${key}'`
        );
      return this.defaultValue(variantType, parentFields);
    }
  }
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
        const size = this.sizeof({ kind: type.base });
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
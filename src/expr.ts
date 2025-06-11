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

  sizeOf(
    type: FieldType,
    options: {
      value?: Value;
      parentFields?: Map<string, Value> | null;
      mode: "min" | "max" | "default";
    }
  ): number {
    const { value, parentFields, mode } = options;

    switch (type.kind) {
      case "Enum":
        return this.sizeOfPrimitive(type.base);

      case "Struct": {
        const struct = this.get(type.name);
        if (!struct) throw new Error(`Unknown struct '${type.name}'`);

        const fieldMap =
          value?.kind === "Struct" && value.name === type.name
            ? value.fields
            : null;

        let total = 0;
        for (const [fieldName, fieldType] of struct.fields) {
          const fieldVal = fieldMap?.get(fieldName);
          total += this.sizeOf(fieldType, {
            value: fieldVal,
            parentFields: fieldMap,
            mode
          });
        }
        return total;
      }

      case "Match": {
        const discrVal = parentFields?.get(type.discriminant);

        if (discrVal?.kind === "Enum") {
          const caseType = type.cases.get(discrVal.value);
          if (!caseType)
            throw new Error(
              `No case in match for enum value '${discrVal.value}'`
            );

          const innerVal = (value?.kind !== "Struct") ? value : undefined;
          return this.sizeOf(caseType, {
            value: innerVal,
            parentFields,
            mode
          });
        }

        // ── Fallback: no discriminant ──
        if (mode === "default") {
          const [firstCaseKey, firstCaseType] = type.cases.entries().next().value ?? [];
          if (!firstCaseType) return 0;
          return this.sizeOf(firstCaseType, {
            value: undefined,
            parentFields,
            mode
          });
        }

        // ── "min" or "max" ──
        let best = mode === "max" ? 0 : Infinity;
        for (const ct of type.cases.values()) {
          const size = this.sizeOf(ct, { value: undefined, parentFields, mode });
          if (mode === "max") best = Math.max(best, size);
          else best = Math.min(best, size);
        }
        return isFinite(best) ? best : 0;
      }

      default:
        return this.sizeOfPrimitive(type.kind);
    }
  }

  minSizeOf(type: FieldType, value?: Value, parentFields: Map<string, Value> | null = null): number {
    return this.sizeOf(type, { value, parentFields, mode: "min" });
  }
  
  maxSizeOf(type: FieldType, value?: Value, parentFields: Map<string, Value> | null = null): number {
    return this.sizeOf(type, { value, parentFields, mode: "max" });
  }
  
  defaultSizeOf(type: FieldType, value?: Value, parentFields: Map<string, Value> | null = null): number {
    return this.sizeOf(type, { value, parentFields, mode: "default" });
  }


  sizeOfPrimitive(kind: "i8" | "i16" | "i32" | "i64" | "f32" | "f64"): number{
      switch (kind){
        case "i8":  return 1;
        case "i16": return 2;
        case "i32": return 4;
        case "i64": return 8;
        case "f32": return 4;
        case "f64": return 8;
      }
  }

  encodeValue(value: Value): Uint8Array {
    const bytes: number[] = [];
    this.writeValueHelper(value, bytes);
    return new Uint8Array(bytes);
  }

  writeValueHelper(value: Value, out: number[]): void {
    const putInt = (val: number | bigint, size: 1 | 2 | 4 | 8) => {
      switch (size) {
        case 1:
          out.push(Number(val) & 0xFF);
          break;
        case 2: {
          const n = Number(val);
          out.push(n & 0xFF, (n >> 8) & 0xFF);
          break;
        }
        case 4: {
          const n = Number(val);
          for (let i = 0; i < 4; i++) out.push((n >> (8 * i)) & 0xFF);
          break;
        }
        case 8: {
          const n = BigInt(val);
          for (let i = 0n; i < 8n; i++) out.push(Number((n >> (8n * i)) & 0xFFn));
          break;
        }
      }
    };

    const putFloat = (val: number, size: 4 | 8) => {
      const view = new DataView(new ArrayBuffer(size));
      if (size === 4) view.setFloat32(0, val, true);
      else view.setFloat64(0, val, true);
      for (let i = 0; i < size; i++) out.push(view.getUint8(i));
    };

    switch (value.kind) {
      case "i8":  putInt(value.value, 1); break;
      case "i16": putInt(value.value, 2); break;
      case "i32": putInt(value.value, 4); break;
      case "i64": putInt(value.value, 8); break;
      case "f32": putFloat(value.value, 4); break;
      case "f64": putFloat(value.value, 8); break;

      case "Enum": {
        const enumMap = this.getEnum(value.name);
        if (!enumMap) throw new Error(`Enum '${value.name}' not found`);
        const num = enumMap.get(value.value);
        if (num === undefined) throw new Error(`Enum variant '${value.value}' not found`);
        putInt(num, this.maxSizeOf({ kind: value.base }) as 1 | 2 | 4 | 8);
        break;
      }

      case "Struct": {
        const struct = this.get(value.name);
        if (!struct) throw new Error(`Unknown struct '${value.name}'`);
        for (const [fname, ftype] of struct.fields) {
          const fval = value.fields.get(fname) ?? this.defaultValue(ftype, value.fields);
          this.writeValueHelper(fval, out);
        }
        break;
      }
    }
  }


  readValue(buf: ArrayBuffer, layoutName: string): Value | null {
    const result = this.readByType(buf, {kind: "Struct", name: layoutName});
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

  private readByType(buf: ArrayBuffer, type: FieldType, parentFields: Map<string, Value> | null = null): [Value, number] | null {
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
        const size = this.maxSizeOf({ kind: type.base });
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
        const struct = this.get(type.name);
        if (!struct) return null;
  
        let offset = 0;
        const fields: Map<string, Value> = new Map();
  
        for (const [fieldName, type] of struct.fields) {
          let value: Value;
            const result = this.readByType(buf.slice(offset), type, fields);
            if (!result) return null;
            result[1] += offset;
            [value, offset] = result;
          fields.set(fieldName, value);
        }
  
        return [{ kind: "Struct", name: type.name, fields }, offset];
      }
      case "Match": {
        if (!parentFields){
          return null;
        }
        const discrimVal = parentFields.get(type.discriminant);
        if (!discrimVal || discrimVal.kind !== "Enum") {
          throw new Error(`Discriminant '${type.discriminant}' not available or not Enum`);
        }
        const caseType = type.cases.get(discrimVal.value);
        if (!caseType) throw new Error(`No match case for '${discrimVal.value}'`);
        return this.readByType(buf, caseType, parentFields);
      }
    }
  }
}
import { HebrewDecoder, HebrewEncoder } from "./utils/hebrew";

export type ValueMap = { [key: string]: Value | undefined };

export type Value =
  // Struct
  ValueMap |
  // Array
  (Value | undefined)[] |
  // i8, i16, i32, i64, f32, f64
  number | bigint |
  // Enum
  string;

export function isValueMap(v: Value | undefined): v is ValueMap {
  return typeof v === "object";
}

export type ArrayLength = { kind: "Static", value: number } | { kind: "Dynamic", field: string };

export type FieldType =
  | { kind: "Struct"; name: string }
  | { kind: "Array", elementType: FieldType, length: ArrayLength }
  | { kind: "Enum"; name: string; base: "i8" | "i16" | "i32" | "i64" }
  | { kind: "Match", discriminant: string; enumTypeName: string; cases: { [caseName: string]: FieldType } }
  | { kind: "i8" }
  | { kind: "i16" }
  | { kind: "i32" }
  | { kind: "i64" }
  | { kind: "f32" }
  | { kind: "f64" }
  | { kind: "CString" }
  | { kind: "HebrewString" };

export interface Struct {
  fields: [string, FieldType][];
}

export class Expr {
  structs: { [structName: string]: Struct };
  enums: { [enumName: string]: Map<string, number> };

  constructor(
    types: [
      | { type: "Struct"; name: string; fields: [string, FieldType][] }
      | { type: "Enum"; name: string; entries: [string, number][] }
    ]
  ) {
    this.structs = {};
    this.enums = {};

    for (const def of types) {
      if (def.type === "Struct") {
        this.structs[def.name] = { fields: def.fields };
      } else if (def.type === "Enum") {
        this.enums[def.name] = new Map(def.entries);
      }
    }
  }



  get(name: string): Struct | undefined {
    return this.structs[name];
  }

  getEnum(name: string): Map<string, number> | undefined {
    return this.enums[name];
  }

  sizeOf(
    type: FieldType,
    options: {
      value?: Value;
      parentFields?: ValueMap;
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
          value && isValueMap(value)
            ? value
            : undefined;

        let total = 0;
        for (const [fieldName, fieldType] of struct.fields) {
          const fieldVal = fieldMap && fieldMap[fieldName];
          total += this.sizeOf(fieldType, {
            value: fieldVal,
            parentFields: fieldMap,
            mode
          });
        }

        return total;
      }

      case "Match": {
        const discrVal = parentFields && (parentFields[type.discriminant]);

        if (discrVal && typeof discrVal == "string") {
          const caseType = type.cases[discrVal];
          if (!caseType)
            throw new Error(
              `No case in match for enum value '${discrVal}'`
            );

          return this.sizeOf(caseType, {
            value,
            parentFields,
            mode
          });
        }

        if (mode === "default") {
          const defaultEnumVal = this.getEnum(type.enumTypeName)?.keys().next().value;
          const defaultVal = defaultEnumVal && type.cases[defaultEnumVal];
          if (!defaultVal) return 0;
          return this.sizeOf(defaultVal, {
            value: undefined,
            parentFields,
            mode
          });
        }

        let best = mode === "max" ? 0 : Infinity;
        for (const ct of Object.values(type.cases)) {
          const size = this.sizeOf(ct, { value: undefined, parentFields, mode });
          if (mode === "max") best = Math.max(best, size);
          else best = Math.min(best, size);
        }
        return isFinite(best) ? best : 0;
      }
      case "Array": {
        let length = 0;

        if (type.length.kind === "Static") {
          length = type.length.value;
        } else if (type.length.kind === "Dynamic") {
          const lenField = parentFields?.[type.length.field];
          if (typeof lenField === "number") {
            length = lenField;
          } else if (typeof lenField == "bigint") {
            length = Number(lenField);
          } else {
            switch (mode) {
              case "max":
                return Infinity;
              case "default":
              case "min":
                length = 0;
                break;
            }
          }
        }


        length = Math.max(0, length);


        const elementSize = this.sizeOf(type.elementType, {
          value: undefined,
          parentFields,
          mode,
        });

        return length * elementSize;
      }
      case "CString": {
        if (typeof value == "string") {
          const encoded = new TextEncoder().encode(value);
          return encoded.length;
        } else {
          switch (mode) {
            case "default":
            case "min":
              return 0;
            case "max":
              return Infinity;
          }
        }
        break;
      }
      case "HebrewString": {
        if (typeof value == "string") {
          const encoded = new HebrewEncoder().encode(value);
          return encoded.length;
        } else {
          switch (mode) {
            case "default":
            case "min":
              return 0;
            case "max":
              return Infinity;
          }
        }
        break;
      }
      default:
        return this.sizeOfPrimitive(type.kind);
    }
  }

  sizeOfPrimitive(kind: "i8" | "i16" | "i32" | "i64" | "f32" | "f64"): 1 | 2 | 4 | 8 {
    switch (kind) {
      case "i8": return 1;
      case "i16": return 2;
      case "i32": return 4;
      case "i64": return 8;
      case "f32": return 4;
      case "f64": return 8;
    }
  }

  minSizeOf(type: FieldType, value?: Value, parentFields?: ValueMap): number {
    return this.sizeOf(type, { value, parentFields, mode: "min" });
  }

  maxSizeOf(type: FieldType, value?: Value, parentFields?: ValueMap): number {
    return this.sizeOf(type, { value, parentFields, mode: "max" });
  }

  defaultSizeOf(type: FieldType, value?: Value, parentFields?: ValueMap): number {
    return this.sizeOf(type, { value, parentFields, mode: "default" });
  }

  valueMatchesType(val: Value | undefined, type: FieldType, parentFields?: ValueMap): boolean {
    switch (type.kind) {
      case "i8":
      case "i16":
      case "i32":
      case "f32":
      case "f64":
        return typeof val === "number";

      case "i64":
        return typeof val === "bigint";

      case "Enum":
        return typeof val === "string";

      case "CString":
      case "HebrewString":
        return typeof val === "string";

      case "Struct":
        return typeof val === "object" && val !== null && !Array.isArray(val);

      case "Match": {

        const discr = parentFields?.[type.discriminant];

        const key =
          typeof discr === "string"
            ? discr
            : this
              .getEnum(type.enumTypeName)
              ?.keys()
              .next()
              .value;

        if (typeof key !== "string") {
          return false;
        }

        const caseType = type.cases[key];
        if (!caseType) {
          return false;
        }

        return this.valueMatchesType(val, caseType, val as ValueMap);
      }



      case "Array": {
        if (!Array.isArray(val)) return false;
        // Optionally, you can also check length:
        let expectedLen: number;
        if (type.length.kind === "Static") {
          expectedLen = type.length.value;
        } else {
          const lf = parentFields?.[type.length.field];
          expectedLen =
            typeof lf === "number"
              ? lf
              : typeof lf === "bigint"
                ? Number(lf)
                : 0;
        }
        return val.length === expectedLen;
      }
    }
  }

  encodeValue(value: Value, ty: string): Uint8Array {
    const bytes: number[] = [];
    this.writeValueHelper(value, { kind: "Struct", name: ty }, bytes);

    return new Uint8Array(bytes);
  }


  // Change the signature to return a Result:
  writeValueHelper(
    value: Value | undefined,
    type: FieldType,
    out: number[],
    parentFields?: ValueMap
  ) {
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

    switch (type.kind) {
      // ─── Primitives (never error) ───
      case "i8":
      case "i16":
      case "i32": {
        const num =
          typeof value === "number"
            ? value
            : (this.defaultValue(type, parentFields) as number);
        putInt(num, this.sizeOfPrimitive(type.kind));
        return;
      }
      case "i64": {
        const bi =
          typeof value === "bigint"
            ? value
            : BigInt(this.defaultValue(type, parentFields) as number);
        putInt(bi, 8);
        return;
      }
      case "f32":
      case "f64": {
        const num =
          typeof value === "number"
            ? value
            : (this.defaultValue(type, parentFields) as number);
        putFloat(num, type.kind === "f32" ? 4 : 8);
        return;
      }

      // ─── Enum (error if truly missing) ───
      case "Enum": {
        const enumMap = this.getEnum(type.name);
        if (!enumMap) {
          throw new Error(`Enum '${type.name}' not found`);
        }
        const key = typeof value === "string" ? value : (enumMap.keys().next().value ?? "");
        const num = enumMap.get(key);
        if (num === undefined) {
          throw new
            Error(`Enum variant '${JSON.stringify(value)}' not found`)
          ;
        }
        putInt(num, this.sizeOfPrimitive(type.base));
        return;
      }

      case "Match": {
        const discr = parentFields?.[type.discriminant];
        const key =
          typeof discr === "string"
            ? discr
            : this.getEnum(type.enumTypeName)?.keys().next().value;
        const variantType = key ? type.cases[key] : undefined;
        if (!variantType) {
          throw new Error(
            `Variant '${String(
              key
            )}' not found in cases for enum ${type.enumTypeName}`
          );
        }
        this.writeValueHelper(value, variantType, out, parentFields);
        return;
      }

      case "Struct": {
        const obj: Value = value && isValueMap(value) ? value : {};
        const structDef = this.get(type.name);
        if (!structDef) {
          throw new Error(`Unknown struct '${type.name}'`);
        }
        for (const [fname, ftype] of structDef.fields) {
          const fval: Value = fname in obj ? obj[fname] as Value : this.defaultValue(ftype, obj);
          this.writeValueHelper(fval, ftype, out, obj);
        }
        return;
      }

      case "Array": {

        let expectedLen = 0;
        if (type.length.kind === "Static") {
          expectedLen = type.length.value;
        } else {
          const lf = parentFields?.[type.length.field];
          expectedLen =
            typeof lf === "number"
              ? lf
              : typeof lf === "bigint"
                ? Number(lf)
                : 0;
        }
        expectedLen = Math.max(0, expectedLen);

        const arr: (Value | undefined)[] =
          Array.isArray(value) && (value as unknown[]).length === expectedLen
            ? (value as (Value | undefined)[])
            : new Array<Value | undefined>(expectedLen);

        for (const el of arr) {
          this.writeValueHelper(el, type.elementType, out, parentFields);
        }
        return;
      }

      // ─── C-String & HebrewString (error if not string) ───
      case "CString":
      case "HebrewString": {
        const str = typeof value == "string" ? value : "";

        const encoded =
          type.kind === "CString"
            ? new TextEncoder().encode(str)
            : new HebrewEncoder().encode(str);
        out.push(...encoded, 0);
        return;
      }
    }
  }



  readValue(buf: ArrayBuffer, layoutName: string): Value | undefined {
    const result = this.readByType(buf, { kind: "Struct", name: layoutName });
    if (!result) return undefined;

    const [value, bytesRead] = result;
    if (bytesRead !== buf.byteLength) {
      console.error(`Buffer length mismatch: read ${bytesRead} bytes but buffer has ${buf.byteLength} bytes`);
    }

    return value;
  }


  defaultValue(
    type: FieldType,
    parentFields?: ValueMap
  ): Value {
    switch (type.kind) {
      case "i8": return 0;
      case "i16": return 0;
      case "i32": return 0;
      case "i64": return 0n;
      case "f32": return 0;
      case "f64": return 0;

      case "Enum": {
        const enumDef = this.getEnum(type.name);
        if (!enumDef || enumDef.size === 0)
          throw new Error(`Enum '${type.name}' not found or empty`);
        const firstKey = Array.from(enumDef.keys())[0];
        return firstKey;
      }

      case "Struct": {
        const struct = this.get(type.name);
        if (!struct) throw new Error(`Struct '${type.name}' not found`);

        const fields: ValueMap = {};

        for (const [fieldName, fieldType] of struct.fields) {
          const fieldVal =
            this.defaultValue(fieldType, fields);
          fields[fieldName] = fieldVal;
        }

        return fields;
      }

      case "Match": {
        const discr = parentFields && parentFields[type.discriminant];
        const key = discr && typeof discr === "string" ? discr : this.getEnum(type.enumTypeName)?.keys().next().value;
        const variantType = key ? type.cases[key] : undefined;
        if (!variantType)
          throw new Error(
            `No variant in match '${type.discriminant}' for enum value '${key}'`
          );
        return this.defaultValue(variantType, parentFields);
      }
      case "Array": {
        const len =
          type.length.kind === "Static"
            ? type.length.value
            : (() => {
              const val = parentFields?.[type.length.field];
              if (typeof val === "number") return val;
              if (typeof val === "bigint") return Number(val);
              return 0;
            })();

        return Array.from({ length: len }, () =>
          this.defaultValue(type.elementType, parentFields)
        );
      }
      case "CString": {
        return "";
      }
      case "HebrewString":
        return "";
    }
  }


  private readByType(buf: ArrayBuffer, type: FieldType, parentFields?: ValueMap): [Value | undefined, number] {
    const dv = new DataView(buf);

    const readInt = (size: number): number | bigint | undefined => {
      if (buf.byteLength < size) return undefined;
      switch (size) {
        case 1: return dv.getInt8(0);
        case 2: return dv.getInt16(0, true);
        case 4: return dv.getInt32(0, true);
        case 8: return dv.getBigInt64(0, true);
        default: throw new Error(`Invalid int size: ${size}`);
      }
    };

    switch (type.kind) {
      case "i8":
        if (buf.byteLength < 1) return [undefined, 1];
        return [dv.getInt8(0), 1];
      case "i16":
        if (buf.byteLength < 2) return [undefined, 2];
        return [dv.getInt16(0, true), 2];
      case "i32":
        if (buf.byteLength < 4) return [undefined, 4];
        return [dv.getInt32(0, true), 4];
      case "i64":
        if (buf.byteLength < 8) return [undefined, 8];
        return [dv.getBigInt64(0, true), 8];
      case "f32":
        if (buf.byteLength < 4) return [undefined, 4];
        return [dv.getFloat32(0, true), 4];
      case "f64":
        if (buf.byteLength < 8) return [undefined, 8];
        return [dv.getFloat64(0, true), 8];

      case "Enum": {
        const enumMap = this.getEnum(type.name);
        if (!enumMap) throw new Error(`Enum '${type.name}' not found.`);
        const size = this.sizeOfPrimitive(type.base);
        const raw = readInt(size);
        const entry = [...enumMap.entries()].find(([, num]) =>
          typeof raw === "bigint" ? BigInt(num) === raw : num === raw
        );
        return [entry && entry[0], size];
      }

      case "Struct": {
        const struct = this.get(type.name);
        if (!struct) throw new Error(`Struct ${type.name} does not exist`);

        let offset = 0;
        const fields: ValueMap = {};

        for (const [fieldName, fieldType] of struct.fields) {
          const result = this.readByType(buf.slice(offset), fieldType, fields);
          const [value, size] = result;
          offset += size;
          if (value === undefined) continue;
          fields[fieldName] = value;
        }

        return [fields, offset];
      }

      case "Match": {
        if (!parentFields) throw new Error(`no parent fields for match`);
        const discrimVal = parentFields[type.discriminant];
        if (!discrimVal) { return [undefined, 0] }
        if (typeof discrimVal !== "string") {
          throw new Error(`Discriminant '${type.discriminant}' not available or not string`);
        }
        const caseType = type.cases[discrimVal];
        if (!caseType) throw new Error(`No match case for '${discrimVal}'`);
        return this.readByType(buf, caseType, parentFields);
      }

      case "Array": {
        const elementType = type.elementType;
        let length: number;

        if (type.length.kind === "Static") {
          length = type.length.value;
        } else if (type.length.kind === "Dynamic") {
          const dynLength = parentFields?.[type.length.field];
          if (typeof dynLength === "number") {
            length = dynLength;
          } else if (typeof dynLength == "bigint") {
            length = Number(dynLength);
          } else {
            length = 0;
          }
        } else {
          throw new Error("Invalid array length kind");
        }

        length = Math.max(0, length);

        const values: (Value | undefined)[] = [];
        let offset = 0;

        for (let i = 0; i < length; i++) {
          if (offset >= buf.byteLength) return [values, offset];
          const result = this.readByType(buf.slice(offset), elementType, parentFields);
          if (!result) return [values, offset];
          const [value, size] = result;
          values.push(value);
          offset += size;
        }

        return [values, offset];
      }

      case "CString": {
        let end = -1;

        for (let i = 0; i < buf.byteLength; i++) {
          if (dv.getUint8(i) === 0) {
            end = i;
            break;
          }
        }

        if (end === -1) return [undefined, buf.byteLength];

        const strBytes = new Uint8Array(buf.slice(0, end));
        const str = new TextDecoder().decode(strBytes);
        return [str, end + 1];
      }
      case "HebrewString": {
        let end = -1;

        for (let i = 0; i < buf.byteLength; i++) {
          if (dv.getUint8(i) === 0) {
            end = i;
            break;
          }
        }

        if (end === -1) return [undefined, buf.byteLength];

        const strBytes = new Uint8Array(buf.slice(0, end));
        const str = new HebrewDecoder().decode(strBytes);
        return [str, end + 1];
      }
    }
  }

}

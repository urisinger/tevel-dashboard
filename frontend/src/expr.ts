export type ValueMap = { [k: string]: Value };

export type Value =
  // Struct
  ValueMap |
  // Array
  Value[] |
  // i8, i16, i32, i64, f32, f64
  number | bigint |
  // Enum
  string;

function isValueMap(v: Value): v is ValueMap {
  return typeof v === "object" && v !== null;
}

export type ArrayLength = { kind: "Static", value: number } | { kind: "Dynamic", field: string };

export type FieldType =
  | { kind: "Struct"; name: string }
  | { kind: "Array", elementType: FieldType, length: ArrayLength }
  | { kind: "CString" }
  | { kind: "Enum"; name: string; base: "i8" | "i16" | "i32" | "i64" }
  | { kind: "Match", discriminant: string; enumTypeName: string; cases: { [caseName: string]: FieldType } }
  | { kind: "i8" }
  | { kind: "i16" }
  | { kind: "i32" }
  | { kind: "i64" }
  | { kind: "f32" }
  | { kind: "f64" };

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
          const defaultVal = type.cases[this.getEnum(type.enumTypeName)?.keys().next().value];
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

  encodeValue(value: Value, ty: string): Uint8Array {
    const bytes: number[] = [];
    this.writeValueHelper(value, { kind: "Struct", name: ty }, bytes);

    return new Uint8Array(bytes);
  }

  writeValueHelper(value: Value, type: FieldType, out: number[], parentFields?: ValueMap): void {
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
      case "i8": putInt(value as number, 1); break;
      case "i16": putInt(value as number, 2); break;
      case "i32": putInt(value as number, 4); break;
      case "i64": putInt(value as bigint, 8); break;
      case "f32": putFloat(value as number, 4); break;
      case "f64": putFloat(value as number, 8); break;

      case "Enum": {
        const enumMap = this.getEnum(type.name);
        if (!enumMap) throw new Error(`Enum '${type.name}' not found`);
        const num = enumMap.get(value as string);
        if (num === undefined) throw new Error(`Enum variant '${value}' not found`);
        putInt(num, this.sizeOfPrimitive(type.base));
        break;
      }
      case "Match": {
        const discr = parentFields && parentFields[type.discriminant];
        const key = discr && typeof discr === "string" ? discr : this.getEnum(type.enumTypeName)?.keys().next().value;
        const variantType = key ? type.cases[key] : undefined;

        if (!variantType) {
          throw new Error(`Variant ${key} not found in cases for enum ${type.enumTypeName}`);
        }

        this.writeValueHelper(value, variantType, out, value as ValueMap);
        break;
      }
      case "Struct": {
        const struct = this.get(type.name);
        if (!struct) throw new Error(`Unknown struct '${type.name}'`);
        if (typeof struct != 'object') throw new Error('Struct must be object');
        for (const [fname, ftype] of struct.fields) {
          const fval = value[fname] ?? this.defaultValue(ftype, value as ValueMap);
          this.writeValueHelper(fval, ftype, out, value as ValueMap);
        }
        break;
      }
      case "Array": {
        const arr = value as Value[];

        let length: number;

        if (type.length.kind === "Static") {
          length = type.length.value;
        } else if (type.length.kind === "Dynamic") {
          const lenField = parentFields?.[type.length.field];
          if (typeof lenField === "number") {
            length = lenField;
          } else if (typeof lenField == "bigint") {
            length = Number(lenField);
          } else {
            length = 0;
          }
        } else {
          throw new Error("Invalid array length kind");
        }

        length = Math.max(0, length);

        if (!Array.isArray(arr)) {
          throw new Error(`Expected array for field, got ${typeof arr}`);
        }

        if (arr.length !== length) {
          throw new Error(`Array length mismatch: expected ${length}, got ${arr.length}`);
        }

        for (const el of arr) {
          this.writeValueHelper(el, type.elementType, out, parentFields);
        }
        break;
      }
      case "CString": {
        if (typeof value !== "string") {
          throw new Error(`Expected string for CString, got ${typeof value}`);
        }

        const encoded = new TextEncoder().encode(value);
        for (const byte of encoded) {
          out.push(byte);
        }

        out.push(0);
        break;
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

        const fields = {};

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

        console.log()
        return Array.from({ length: len }, () =>
          this.defaultValue(type.elementType, parentFields)
        );
      }
      case "CString": {
        return ""
      }
    }
  }


  private readByType(buf: ArrayBuffer, type: FieldType, parentFields?: ValueMap): [Value, number] | undefined {
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
        if (buf.byteLength < 1) return undefined;
        return [dv.getInt8(0), 1];
      case "i16":
        if (buf.byteLength < 2) return undefined;
        return [dv.getInt16(0, true), 2];
      case "i32":
        if (buf.byteLength < 4) return undefined;
        return [dv.getInt32(0, true), 4];
      case "i64":
        if (buf.byteLength < 8) return undefined;
        return [dv.getBigInt64(0, true), 8];
      case "f32":
        if (buf.byteLength < 4) return undefined;
        return [dv.getFloat32(0, true), 4];
      case "f64":
        if (buf.byteLength < 8) return undefined;
        return [dv.getFloat64(0, true), 8];

      case "Enum": {
        const enumMap = this.getEnum(type.name);
        if (!enumMap) throw new Error(`Enum '${type.name}' not found.`);
        const size = this.sizeOfPrimitive(type.base);
        const raw = readInt(size);
        if (raw === undefined) return undefined;
        const entry = [...enumMap.entries()].find(([, num]) =>
          typeof raw === "bigint" ? BigInt(num) === raw : num === raw
        );
        if (!entry) throw new Error(`Unknown enum value '${raw}' for enum '${type.name}'`);
        return [entry[0], size];
      }

      case "Struct": {
        const struct = this.get(type.name);
        if (!struct) return undefined;

        let offset = 0;
        const fields: ValueMap = {};

        for (const [fieldName, fieldType] of struct.fields) {
          if (offset >= buf.byteLength) return [fields, offset];
          const result = this.readByType(buf.slice(offset), fieldType, fields);
          if (!result) return [fields, offset];
          const [value, size] = result;
          fields[fieldName] = value;
          offset += size;
        }

        return [fields, offset];
      }

      case "Match": {
        if (!parentFields) return undefined;
        const discrimVal = parentFields[type.discriminant];
        if (!discrimVal || typeof discrimVal !== "string") {
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
            throw new Error(`Dynamic array length field '${type.length.field}' missing or invalid`);
          }
        } else {
          throw new Error("Invalid array length kind");
        }

        length = Math.max(0, length);

        const values: Value[] = [];
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

        if (end === -1) return undefined;

        const strBytes = new Uint8Array(buf.slice(0, end));
        const str = new TextDecoder().decode(strBytes);
        return [str, end + 1];
      }
    }
  }

}
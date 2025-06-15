import { BitReader, BitWriter } from "./utils/Bits";
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

export type ArrayLength =
  | { kind: "Static"; value: number }
  | { kind: "Dynamic"; field: string };

export type FieldType =
  | { kind: "Struct"; name: string }
  | {
    kind: "Array";
    elementType: FieldType;
    length: ArrayLength;
  }
  | {
    kind: "Enum";
    name: string;
    width: number;
  }
  | {
    kind: "Match";
    discriminant: string;
    enumTypeName: string;
    cases: { [caseName: string]: FieldType };
  }
  | {
    kind: "Int";
    signed: boolean;
    width: number;
  }
  | { kind: "f32" }
  | { kind: "f64" }
  | { kind: "CString" }
  | { kind: "HebrewString" };


export interface Struct {
  fields: [string, FieldType][];
};

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

  sizeOfBits(
    type: FieldType,
    options: {
      value?: Value;
      parentFields?: ValueMap;
      mode: "min" | "max" | "default";
    }
  ): number {
    const { value, parentFields, mode } = options;

    switch (type.kind) {
      // ─── Fixed‐width ints ───
      case "Int":
        return type.width;

      // ─── Floats ───
      case "f32":
        return 32;
      case "f64":
        return 64;

      // ─── Enums (backed by an integer width) ───
      case "Enum":
        return type.width;


      // TODO: Use reduce(will do after refactor is over)
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
          total += this.sizeOfBits(fieldType, {
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

          return this.sizeOfBits(caseType, {
            value,
            parentFields,
            mode
          });
        }

        if (mode === "default") {
          const defaultEnumVal = this.getEnum(type.enumTypeName)?.keys().next().value;
          const defaultVal = defaultEnumVal && type.cases[defaultEnumVal];
          if (!defaultVal) return 0;
          return this.sizeOfBits(defaultVal, {
            value: undefined,
            parentFields,
            mode
          });
        }

        let best = mode === "max" ? 0 : Infinity;
        for (const ct of Object.values(type.cases)) {
          const size = this.sizeOfBits(ct, { value: undefined, parentFields, mode });
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


        const elementSize = this.sizeOfBits(type.elementType, {
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
    }
  }

  bitsToBytes(bits: number): number {
    if (!isFinite(bits)) return Infinity;
    return Math.ceil(bits / 8);
  }

  minSizeOf(type: FieldType, value?: Value, parentFields?: ValueMap) {
    const b = this.sizeOfBits(type, {
      mode: "min", value, parentFields,
    });
    return this.bitsToBytes(b);
  }
  maxSizeOf(type: FieldType, value?: Value, parentFields?: ValueMap) {
    const b = this.sizeOfBits(type, {
      mode: "max", value, parentFields,
    });
    return this.bitsToBytes(b);
  }

  defaultSizeOf(type: FieldType, value?: Value, parentFields?: ValueMap) {
    const b = this.sizeOfBits(type, {
      mode: "default", value, parentFields,
    });
    return this.bitsToBytes(b);
  }


  valueMatchesType(
    val: Value | undefined,
    type: FieldType,
    parentFields?: ValueMap
  ): boolean {
    switch (type.kind) {
      case "Int":
        return typeof val === "bigint";

      case "f32":
      case "f64":
        return typeof val === "number";

      case "Enum":
        return typeof val === "string";

      case "CString":
      case "HebrewString":
        return typeof val === "string";

      case "Struct":
        return typeof val === "object" && val !== null && !Array.isArray(val);

      case "Match": {
        if (typeof val !== "object" || val === null) return false;
        const discr = parentFields?.[type.discriminant];
        const key =
          typeof discr === "string"
            ? discr
            : this.getEnum(type.enumTypeName)?.keys().next().value;
        if (typeof key !== "string") return false;

        const caseType = type.cases[key];
        if (!caseType) return false;

        return this.valueMatchesType(val, caseType, val as ValueMap);
      }

      case "Array": {
        if (!Array.isArray(val)) return false;
        let expectedLen: number;
        if (type.length.kind === "Static") {
          expectedLen = type.length.value;
        } else {
          const lf = parentFields?.[type.length.field];
          expectedLen =
            typeof lf === "number" ? lf :
              typeof lf === "bigint" ? Number(lf) :
                0;
        }
        return val.length === expectedLen;
      }
    }
  }
  encodeValue(value: Value, ty: string): ArrayBuffer {
    const writer = new BitWriter();
    this.writeValueHelper(value, { kind: "Struct", name: ty }, writer);
    return writer.finish();
  }


  writeValueHelper(
    value: Value | undefined,
    type: FieldType,
    writer: BitWriter,
    parentFields?: ValueMap
  ): void {
    switch (type.kind) {
      case "Int": {
        const bi: bigint =
          typeof value === "bigint"
            ? value
            : (this.defaultValue(type, parentFields) as bigint);
        if (type.signed) {
          writer.writeInt(bi, type.width);
        } else {
          writer.writeUInt(bi, type.width);
        }
        return;
      }
      case "f32": {
        const num =
          typeof value === "number"
            ? value
            : (this.defaultValue(type, parentFields) as number);
        writer.writeFloat32(num);
        return;
      }
      case "f64": {
        const num =
          typeof value === "number"
            ? value
            : (this.defaultValue(type, parentFields) as number);
        writer.writeFloat64(num);
        return;
      }
      case "Enum": {
        const enumMap = this.getEnum(type.name);
        if (!enumMap) throw new Error(`Enum '${type.name}' not found`);
        const key =
          typeof value === "string"
            ? value
            : enumMap.keys().next().value ?? "";
        const num = enumMap.get(key);
        if (num === undefined) {
          throw new Error(`Enum variant '${JSON.stringify(value)}' not found`);
        }
        writer.writeUInt(BigInt(num), type.width);
        return;
      }
      case "CString": {
        const str = typeof value === "string" ? value : "";
        writer.writeCString(str);
        return;
      }
      case "HebrewString": {
        const str = typeof value === "string" ? value : "";
        writer.writeHebrewString(str);
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
        this.writeValueHelper(value, variantType, writer, parentFields);
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
          this.writeValueHelper(fval, ftype, writer, obj);
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
          this.writeValueHelper(el, type.elementType, writer, parentFields);
        }
        return;
      }

    }
  }


  defaultValue(
    type: FieldType,
    parentFields?: ValueMap
  ): Value {
    switch (type.kind) {
      case "Int":
        return 0n;

      case "f32":
      case "f64":
        return 0;

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


  decodeValue(buf: ArrayBuffer, layoutName: string): Value | undefined {
    const reader = new BitReader(buf);
    const result = this.readValueHelper(reader, { kind: "Struct", name: layoutName }, {});
    if (result === undefined) return undefined;
    return result;
  }


  private readValueHelper(
    reader: BitReader,
    type: FieldType,
    parentFields: ValueMap
  ): Value | undefined {
    switch (type.kind) {
      case "Int": {
        if (type.signed) {
          return reader.readInt(type.width);
        } else {
          return reader.readUInt(type.width);
        }
      }

      case "Enum": {
        // enums are always unsigned indexes
        const raw = reader.readBits(type.width);
        if (raw === undefined) return undefined;
        const enumMap = this.getEnum(type.name);
        if (!enumMap) throw new Error(`Enum '${type.name}' not found`);
        // find the matching key
        for (const [label, num] of enumMap) {
          if (num === raw) return label;
        }
        throw new Error(`Enum '${type.name}' has no variant ${raw}`);
      }

      case "f32": {
        // read 32 bits into an ArrayBuffer then decode
        const buf = new ArrayBuffer(4);
        const dv = new DataView(buf);
        for (let i = 0; i < 4; i++) {
          const b = reader.readBits(8);
          if (b === undefined) return undefined;
          dv.setUint8(i, b);
        }
        return dv.getFloat32(0, true);
      }
      case "f64": {
        const buf = new ArrayBuffer(8);
        const dv = new DataView(buf);
        for (let i = 0; i < 8; i++) {
          const b = reader.readBits(8);
          if (b === undefined) return undefined;
          dv.setUint8(i, b);
        }
        return dv.getFloat64(0, true);
      }

      case "Struct": {
        const structDef = this.get(type.name);
        if (!structDef) throw new Error(`Unknown struct '${type.name}'`);
        const out: ValueMap = {};
        for (const [fname, ftype] of structDef.fields) {
          const v = this.readValueHelper(reader, ftype, out);
          if (v !== undefined) out[fname] = v;
        }
        return out;
      }

      case "Match": {
        // read discriminant first
        const discr = parentFields[type.discriminant];
        if (typeof discr !== "string") {
          throw new Error(`Missing discriminant '${type.discriminant}'`);
        }
        const caseType = type.cases[discr];
        if (!caseType) {
          throw new Error(`No case for '${discr}' in match`);
        }
        return this.readValueHelper(reader, caseType, parentFields);
      }

      case "Array": {
        let length: number;
        if (type.length.kind === "Static") {
          length = type.length.value;
        } else {
          const lf = parentFields[type.length.field];
          length =
            typeof lf === "number" ? lf :
              typeof lf === "bigint" ? Number(lf) :
                0;
        }
        const arr: Value[] = [];
        for (let i = 0; i < length; i++) {
          const v = this.readValueHelper(reader, type.elementType, parentFields);
          arr.push(v === undefined ? this.defaultValue(type.elementType, parentFields) : v);
        }
        return arr;
      }

      case "CString":
      case "HebrewString": {
        const bytes: number[] = [];
        while (!reader.isEOF()) {
          const b = reader.readBits(8);
          if (b === undefined) return undefined;
          if (b === 0) break;
          bytes.push(b);
        }
        return (type.kind == "CString" ? new TextDecoder() : new HebrewDecoder()).decode(new Uint8Array(bytes));
      }
    }
  }
}


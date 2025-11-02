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

export type ArgumentValue = 
  | { kind: "Identifier"; name: string }
  | { kind: "Literal"; value: number };

export type Parameter = {
  name: string;
  paramType: FieldType;
};

export type FieldType = (
  | { kind: "Struct"; name: string; arguments?: ArgumentValue[] }
  | {
    kind: "Array";
    elementType: FieldType;
    length: ArrayLength;
  }
  | {
    kind: "Match";
    discriminant: string;
    enumTypeName: string;
    cases: { [caseName: string]: FieldType };
  }
  | {
    kind: "Enum";
    name: string;
    width: number;
    default?: string;
  }
  | {
    kind: "Int";
    signed: boolean;
    width: number;
    default?: number;
  }
  | { kind: "f32", default?: number }
  | { kind: "f64", default?: number }
  | { kind: "CString", default?: string }
  | { kind: "HebrewString", default?: string });


export interface Struct {
  fields: [string, FieldType][];
  parameters?: Parameter[];
}

export type ParameterValue = number | string | boolean;

export class ParameterContext {
  private parameters: Map<string, ParameterValue> = new Map();
  private fieldValues: Map<string, ParameterValue> = new Map();

  constructor(
    parameters?: Map<string, ParameterValue>,
    fieldValues?: Map<string, ParameterValue>
  ) {
    this.parameters = parameters ?? new Map();
    this.fieldValues = fieldValues ?? new Map();
  }

  addFieldValue(name: string, value: ParameterValue): void {
    this.fieldValues.set(name, value);
  }

  resolveArgument(arg: ArgumentValue): ParameterValue | undefined {
    switch (arg.kind) {
      case "Identifier":
        // Try field first, then parameter
        return this.fieldValues.get(arg.name) ?? this.parameters.get(arg.name);
      case "Literal":
        return arg.value;
    }
  }

  createChildContext(
    parameterNames: string[],
    args: ArgumentValue[]
  ): ParameterContext {
    const newParams = new Map<string, ParameterValue>();
    
    parameterNames.forEach((paramName, index) => {
      if (args[index]) {
        const resolvedValue = this.resolveArgument(args[index]);
        if (resolvedValue !== undefined) {
          newParams.set(paramName, resolvedValue);
        }
      }
    });

    return new ParameterContext(newParams, new Map());
  }

  getParameter(name: string): ParameterValue | undefined {
    return this.parameters.get(name);
  }

  getFieldValue(name: string): ParameterValue | undefined {
    return this.fieldValues.get(name);
  }

  hasParameter(name: string): boolean {
    return this.parameters.has(name);
  }

  getParameterNames(): string[] {
    return Array.from(this.parameters.keys());
  }
};

export class Expr {
  structs: { [structName: string]: Struct };
  enums: { [enumName: string]: Map<string, number> };

  constructor(
    types: (
      | { type: "Struct"; name: string; fields: [string, FieldType][]; parameters?: Parameter[] }
      | { type: "Enum"; name: string; entries: [string, number][] }
    )[]
  ) {
    this.structs = {};
    this.enums = {};

    for (const def of types) {
      if (def.type === "Struct") {
        this.structs[def.name] = { 
          fields: def.fields,
          parameters: def.parameters 
        };
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
      parentFieldTypes?: [string, FieldType][];
      mode: "min" | "max" | "default";
    }
  ): number {
    const { value, parentFields, parentFieldTypes, mode } = options;

    switch (type.kind) {
      case "Int":
        return type.width;
      case "f32":
        return 32;
      case "f64":
        return 64;
      case "Enum":
        return type.width;
      case "CString": {
        const str: string | undefined =
          typeof value === "string"
            ? value
            : mode === "default" && type.default !== undefined
              ? type.default
              : undefined;

        if (str !== undefined) {
          const encoded = new TextEncoder().encode(str);
          return encoded.length * 8;
        } else {
          return mode === "max" ? Infinity : 8;
        }
      }

      case "HebrewString": {
        const str: string | undefined =
          typeof value === "string"
            ? value
            : mode === "default" && type.default !== undefined
              ? type.default
              : undefined;

        if (str !== undefined) {
          const encoded = new HebrewEncoder().encode(str);
          return encoded.length;
        } else {
          return mode === "max" ? Infinity : 8;
        }
      }



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
            parentFieldTypes: struct.fields,
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
            parentFieldTypes,
            mode
          });
        }

        if (mode === "default") {
          const enumFieldTuple = parentFieldTypes
            ?.find(([fieldName]) => fieldName === type.discriminant);
          let defaultEnumVal: string | undefined = undefined;
          if (enumFieldTuple) {
            const [, enumFT] = enumFieldTuple;
            if (enumFT.kind === "Enum" && enumFT.default !== undefined) {
              defaultEnumVal = enumFT.default;
            }
          }
          if (!defaultEnumVal) {
            defaultEnumVal = this.getEnum(type.enumTypeName)?.keys().next().value;
          }
          const defaultVal = defaultEnumVal && type.cases[defaultEnumVal];
          if (!defaultVal) return 0;
          return this.sizeOfBits(defaultVal, {
            value: undefined,
            parentFields,
            parentFieldTypes,
            mode
          });
        }

        let best = mode === "max" ? 0 : Infinity;
        for (const ct of Object.values(type.cases)) {
          const size = this.sizeOfBits(ct, { value: undefined, parentFields, parentFieldTypes, mode });
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
          const field = type.length.field;
          const lenField = parentFields?.[field];
          if (typeof lenField === "number") {
            length = lenField;
          } else if (typeof lenField == "bigint") {
            length = Number(lenField);
          } else {
            switch (mode) {
              case "max":
                return Infinity;
              case "default":
                {
                  const intFieldTuple = parentFieldTypes?.find(([fieldName]) => fieldName === field);
                  if (intFieldTuple) {
                    const [, intFT] = intFieldTuple;
                    if (intFT.kind === "Int" && intFT.default !== undefined) {
                      length = intFT.default;
                      break;
                    }
                  }
                  return 0;
                }
              case "min":
                return 0;
            }
          }
        }


        length = Math.max(0, length);


        const elementSize = this.sizeOfBits(type.elementType, {
          value: undefined,
          parentFields,
          parentFieldTypes,
          mode,
        });

        return length * elementSize;
      }
    }
  }

  bitsToBytes(bits: number): number {
    if (!isFinite(bits)) return Infinity;
    return Math.ceil(bits / 8);
  }

  minSizeOf(type: FieldType, value?: Value, parentFieldTypes?: [string, FieldType][], parentFields?: ValueMap) {
    const b = this.sizeOfBits(type, {
      mode: "min", value, parentFieldTypes, parentFields,
    });
    return this.bitsToBytes(b);
  }
  maxSizeOf(type: FieldType, value?: Value, parentFieldTypes?: [string, FieldType][], parentFields?: ValueMap) {
    const b = this.sizeOfBits(type, {
      mode: "max", value, parentFieldTypes, parentFields,
    });
    return this.bitsToBytes(b);
  }

  defaultSizeOf(type: FieldType, value?: Value, parentFieldTypes?: [string, FieldType][], parentFields?: ValueMap) {
    const b = this.sizeOfBits(type, {
      mode: "default", value, parentFieldTypes, parentFields,
    });
    return this.bitsToBytes(b);
  }


  valueMatchesType(
    val: Value | undefined,
    type: FieldType,
    parentFields?: ValueMap,
    parentFieldTypes?: [string, FieldType][]
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

      case "Struct": {
        if (typeof val !== "object") return false;
        const structVal = val as ValueMap;
        const types: [string, FieldType][] = parentFieldTypes ? [...parentFieldTypes] : [];
        for (const [fieldName, fieldType] of this.get(type.name)!.fields) {
          const fieldVal = structVal[fieldName];
          // append this field's type for children lookups
          types.push([fieldName, fieldType]);
          if (!this.valueMatchesType(fieldVal, fieldType, structVal, types)) {
            return false;
          }
        }
        return true;
      }

      case "Match": {
        if (typeof val !== "object" || val === null) return false;
        // find live discriminator value
        let discrKey = parentFields?.[type.discriminant] as string | undefined;
        // if missing, try enum's default from parentFieldTypes
        if (discrKey === undefined) {
          const entry = parentFieldTypes?.find(([name]) => name === type.discriminant);
          if (entry && entry[1].kind === "Enum" && entry[1].default !== undefined) {
            discrKey = entry[1].default;
          }
        }
        if (typeof discrKey !== "string") return false;
        const caseType = type.cases[discrKey];
        if (!caseType) return false;
        // recurse, val itself becomes new parentFields
        return this.valueMatchesType(val as ValueMap, caseType, val as ValueMap, parentFieldTypes);
      }

      case "Array": {
        if (!Array.isArray(val)) return false;
        let expectedLen: number;
        if (type.length.kind === "Static") {
          expectedLen = type.length.value;
        } else {
          // dynamic: value lives in parentFields
          const lf = parentFields?.[type.length.field];
          expectedLen = typeof lf === "number"
            ? lf
            : typeof lf === "bigint"
              ? Number(lf)
              : 0;
        }
        if (val.length !== expectedLen) return false;
        // element type recursion
        return (val as Value[]).every((el) =>
          this.valueMatchesType(
            el,
            type.elementType,
            parentFields,
            parentFieldTypes
          )
        );
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
    parentFields?: ValueMap,
    parentFieldTypes?: [string, FieldType][]
  ): Value {
    switch (type.kind) {
      case "Int":
        return (type.default && BigInt(type.default)) ?? 0n;

      case "f32":
      case "f64":
        return type.default ?? 0;

      case "Enum": {
        const enumDef = this.getEnum(type.name);
        if (!enumDef) throw new Error(`Enum '${type.name}' not found`);
        const dv = type.default;
        if (dv !== undefined && enumDef.has(dv)) {
          return dv;
        }

        const firstKey = enumDef?.keys().next().value;
        if (firstKey === undefined) throw new Error(`Enum '${type.name}' not found or empty`)
        return firstKey
      }

      case "Struct": {
        const struct = this.get(type.name);
        if (!struct) throw new Error(`Struct '${type.name}' not found`);

        const fields: ValueMap = {};

        for (const [fieldName, fieldType] of struct.fields) {
          const fieldVal =
            this.defaultValue(fieldType, fields, parentFieldTypes);
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
        return this.defaultValue(variantType, parentFields, parentFieldTypes);
      }
      case "Array": {
        const len =
          type.length.kind === "Static"
            ? type.length.value
            : (() => {
              const v = parentFields?.[type.length.field];
              if (typeof v === "number") return v;
              if (typeof v === "bigint") return Number(v);
              return 0;
            })();

        const count = Math.max(0, len);
        return Array.from({ length: count }, () =>
          this.defaultValue(
            type.elementType,
            parentFields,
            parentFieldTypes
          )
        );
      }

      case "CString": {
        return type.default ?? "";
      }
      case "HebrewString":
        return type.default ?? "";
    }
  }


  decodeValue(
    buf: ArrayBuffer, 
    layoutName: string, 
  ): Value | undefined {
    const reader = new BitReader(buf);
    const paramContext = new ParameterContext();
    const result = this.readValueHelper(
      reader, 
      { kind: "Struct", name: layoutName }, 
      {}, 
      paramContext
    );
    if (result === undefined) return undefined;
    return result;
  }

  private readValueHelper(
    reader: BitReader,
    type: FieldType,
    parentFields: ValueMap,
    context: ParameterContext
  ): Value | undefined {
    switch (type.kind) {
      case "Struct": {
        const struct = this.get(type.name);
        if (!struct) throw new Error(`Struct '${type.name}' not found`);

        // Create child context if arguments are provided
        let childContext = context;
        if (type.arguments && struct.parameters) {
          const paramNames = struct.parameters.map(p => p.name);
          childContext = context.createChildContext(paramNames, type.arguments);
        }

        const result: ValueMap = {};
        for (const [fieldName, fieldType] of struct.fields) {
          const fieldValue = this.readValueHelper(reader, fieldType, result, childContext);
          if (fieldValue === undefined) return undefined;
          result[fieldName] = fieldValue;
          
          // Add field value to context for potential parameter references
          if (typeof fieldValue === 'number' || typeof fieldValue === 'string' || typeof fieldValue === 'boolean') {
            childContext.addFieldValue(fieldName, fieldValue);
          }
        }
        return result;
      }
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
        return this.readValueHelper(reader, caseType, parentFields, context);
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
        const arr: (Value | undefined)[] = [];
        for (let i = 0; i < length; i++) {
          const v = this.readValueHelper(reader, type.elementType, parentFields, context);
          arr.push(v);
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


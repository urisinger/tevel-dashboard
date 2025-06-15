import React, { useEffect, useMemo, useState } from "react";
import { Expr, Value, FieldType, Struct, ValueMap, ArrayLength, isValueMap } from "../expr";

import './StructBuilder.css';
import './shared.css';

const wrapInput = (name: string, typeKind: string, input: React.ReactNode) => (
  <div className="field-container">
    <label className="field-label">
      {name}: <span className="field-type">{typeKind}</span>
    </label>
    {input}
  </div>
);

// Hook to manage and validate optional Value props
function useValidated<T extends Value>(
  value: Value | undefined,
  validator: (v: Value) => v is T,
  defaultValue: () => T
) {
  const [internal, setInternal] = useState<T>(
    value !== undefined && validator(value) ? value : defaultValue()
  );
  useEffect(() => {
    if (value !== undefined && validator(value)) {
      setInternal(value);
    } else if (value !== undefined && !validator(value)) {
      setInternal(defaultValue());
    }
  }, [value, validator, defaultValue]);
  return [internal, setInternal] as const;
}

// Primitive Inputs
const I8Input = ({ name, value, onChange }: { name: string; value?: Value; onChange: (v: Value) => void }) => {
  const [val, setVal] = useValidated<number>(
    typeof value === 'number' ? value : undefined,
    (v): v is number => typeof v === 'number',
    () => 0
  );
  return wrapInput(
    name,
    "I8",
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      min={-128}
      max={127}
      value={val}
      className="field-input integer-value"
      onChange={e => {
        const n = parseInt(e.target.value) || 0;
        setVal(n);
        onChange(n);
      }}
    />
  );
};

// Similarly for I16, I32, I64, F32, F64, CString, HebrewString
const I16Input = ({ name, value, onChange }: { name: string; value?: Value; onChange: (v: Value) => void }) => {
  const [val, setVal] = useValidated<number>(
    typeof value === 'number' ? value : undefined,
    (v): v is number => typeof v === 'number',
    () => 0
  );
  return wrapInput(
    name,
    "I16",
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      min={-32768}
      max={32767}
      value={val}
      className="field-input integer-value"
      onChange={e => {
        const n = parseInt(e.target.value) || 0;
        setVal(n);
        onChange(n);
      }}
    />
  );
};

const I32Input = ({ name, value, onChange }: { name: string; value?: Value; onChange: (v: Value) => void }) => {
  const [val, setVal] = useValidated<number>(
    typeof value === 'number' ? value : undefined,
    (v): v is number => typeof v === 'number',
    () => 0
  );
  return wrapInput(
    name,
    "I32",
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={val}
      className="field-input integer-value"
      onChange={e => {
        const n = parseInt(e.target.value) || 0;
        setVal(n);
        onChange(n);
      }}
    />
  );
};

const I64Input = ({ name, value, onChange }: { name: string; value?: Value; onChange: (v: Value) => void }) => {
  const [val, setVal] = useValidated<bigint>(
    typeof value === 'bigint' ? value : undefined,
    (v): v is bigint => typeof v === 'bigint',
    () => BigInt(0)
  );
  return wrapInput(
    name,
    "I64",
    <input
      type="number"
      pattern="[0-9]*"
      value={val.toString()}
      className="field-input bigint-value"
      onChange={e => {
        let bi: bigint;
        try { bi = BigInt(e.target.value); }
        catch { bi = BigInt(0); }
        setVal(bi);
        onChange(bi);
      }}
    />
  );
};

const F32Input = ({
  name,
  value,
  onChange,
}: {
  name: string;
  value?: Value;
  onChange: (v: Value) => void;
}) => {
  const [val, setVal] = useValidated<number>(
    typeof value === "number" ? value : undefined,
    (v): v is number => typeof v === "number",
    () => 0
  );

  return wrapInput(
    name,
    "F32",
    <input
      type="text"
      value={val.toString()}
      className="field-input float-value"
      onChange={(e) => {
        const text = e.target.value;
        const n = parseFloat(text);
        const final = Number.isNaN(n) ? 0 : n;
        setVal(final);
        onChange(final);
      }}
    />
  );
};

const F64Input = ({
  name,
  value,
  onChange,
}: {
  name: string;
  value?: Value;
  onChange: (v: Value) => void;
}) => {
  const [val, setVal] = useValidated<number>(
    typeof value === "number" ? value : undefined,
    (v): v is number => typeof v === "number",
    () => 0
  );

  return wrapInput(
    name,
    "F64",
    <input
      type="text"
      value={val.toString()}
      className="field-input float-value"
      onChange={(e) => {
        const text = e.target.value;
        const n = parseFloat(text);

        const final = Number.isNaN(n) ? 0 : n;
        setVal(final);
        onChange(final);
      }}
    />
  );
};


const StringInput = ({ name, value, onChange }: { name: string; value?: Value; onChange: (v: Value) => void }) => {
  const [val, setVal] = useValidated<string>(
    typeof value === 'string' ? value : undefined,
    (v): v is string => typeof v === 'string',
    () => ''
  );
  return wrapInput(
    name,
    "String",
    <input
      type="text"
      value={val}
      className="field-input string-value"
      onChange={e => {
        setVal(e.target.value);
        onChange(e.target.value);
      }}
    />
  );
};

// StructInput with optional initial value
const StructInput = ({ name, struct, expr, value, onChange }: {
  name: string;
  struct: Struct;
  expr: Expr;
  value?: Value;
  onChange: (v: ValueMap) => void;
}) => {
  const initial: ValueMap = isValueMap(value) ? (value) : {};
  const [fields, setFields] = useState<ValueMap>(initial);
  useEffect(() => { if (isValueMap(value)) setFields(value); }, [value]);

  return (
    <div className="struct-container">
      <div className="struct-header"><span className="struct-name">{name}</span></div>
      <div className="struct-fields">
        {struct.fields.map(([fname, ftype]) => (
          <ValueInput
            key={fname}
            name={fname}
            type={ftype}
            expr={expr}
            parentFields={fields}
            value={fields[fname]}
            onChange={v => {
              const updated = { ...fields, [fname]: v };
              setFields(updated);
              onChange(updated);
            }}
          />
        ))}
      </div>
    </div>
  );
};

// ArrayInput with optional initial array
const ArrayInput = ({ name, type, length, expr, parentFields, value, onChange }: {
  name: string;
  type: FieldType;
  length: ArrayLength;
  expr: Expr;
  parentFields: ValueMap;
  value?: Value;
  onChange: (v: (Value | undefined)[]) => void;
}) => {
  const computedLength = useMemo(() => {
    if (length.kind === "Static") return length.value;
    const v = parentFields[length.field];
    return typeof v === 'number' ? v : typeof v === 'bigint' ? Number(v) : 0;
  }, [length, parentFields]);

  const initial = Array.isArray(value) && (value as Value[]).length === computedLength
    ? (value as Value[])
    : Array.from({ length: computedLength }, () => expr.defaultValue(type, parentFields));

  const [items, setItems] = useState<Value[]>(initial);
  useEffect(() => {
    setItems(prev => Array.from({ length: computedLength }, (_, i) => prev[i] ?? expr.defaultValue(type, parentFields)));
  }, [computedLength, expr, type, parentFields]);
  useEffect(() => {
    if (Array.isArray(value) && (value as Value[]).length === computedLength) {
      setItems(value as Value[]);
    }
  }, [value, computedLength]);

  return (
    <div className="struct-container">
      <div className="struct-header"><span className="struct-name">{name}</span></div>
      <div className="struct-fields">
        {items.map((it, i) => (
          <ValueInput
            key={i}
            name={`${name}[${i}]`}
            type={type}
            expr={expr}
            parentFields={parentFields}
            value={it}
            onChange={v => {
              const updated = [...items]; updated[i] = v;
              setItems(updated);
              onChange(updated);
            }}
          />
        ))}
      </div>
    </div>
  );
};

export const EnumInput: React.FC<{
  name: string;
  type: Extract<FieldType, { kind: "Enum" }>;
  expr: Expr;
  value?: Value;
  onChange: (v: string) => void;
}> = ({ name, type, expr, value, onChange }) => {
  const enumDef = expr.getEnum(type.name);
  const entries = useMemo(
    () => (enumDef ? Array.from(enumDef.entries()) : []),
    [enumDef]
  );

  const defaultKey = useMemo(() => {
    const dv = expr.defaultValue(type) as string;
    return entries.some(([k]) => k === dv) ? dv : entries[0]?.[0] ?? "";
  }, [entries, expr, type]);

  const [selected, setSelected] = useState<string>(() =>
    entries.some(([k]) => k === value) ? (typeof value === "string" ? value : defaultKey) : defaultKey
  );

  // Sync whenever `value`, `entries` or `defaultKey` change
  useEffect(() => {
    if (entries.some(([k]) => k === value)) {
      setSelected(value as string);
    } else {
      setSelected(defaultKey);
      onChange(defaultKey);
    }
  }, [value, entries, defaultKey, onChange]);

  if (!enumDef) {
    return <div className="error-message">Enum "{type.name}" not found</div>;
  }

  return (
    <div className="field-container">
      <label className="field-label">
        {name}: <span className="field-type">{type.name}</span>
      </label>
      <select
        className="field-input enum-value"
        value={selected}
        onChange={(e) => {
          setSelected(e.target.value);
          onChange(e.target.value);
        }}
      >
        {entries.map(([label]) => (
          <option key={label} value={label}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
};


export const MatchInput: React.FC<{
  name: string;
  type: Extract<FieldType, { kind: "Match" }>;
  expr: Expr;
  parentFields: ValueMap;
  value?: Value;
  onChange: (v: Value) => void;
}> = ({ name, type, expr, parentFields, value, onChange }) => {
  const discr = parentFields[type.discriminant];
  const enumKey =
    typeof discr === "string"
      ? discr
      : expr.getEnum(type.enumTypeName)?.keys().next().value;

  const caseType = enumKey ? type.cases[enumKey] : undefined;

  const isValid = caseType
    ? expr.valueMatchesType(value, caseType)
    : false;

  const [inner, setInner] = useState<Value | undefined>(
    isValid ? value : undefined
  );

  useEffect(() => {
    if (!caseType) return;
    const ok = expr.valueMatchesType(value, caseType);
    setInner(ok ? value : undefined);
  }, [value, caseType, expr]);

  if (!enumKey) {
    return (
      <div className="error-message">
        No valid enum key for <strong>{type.discriminant}</strong>
      </div>
    );
  }

  if (!caseType) {
    return (
      <div className="error-message">
        No case for enum value <strong>{enumKey}</strong>
      </div>
    );
  }

  // 4) And finally render the real input
  return (
    <div className="match-container">
      <ValueInput
        name={name}
        type={caseType}
        expr={expr}
        parentFields={parentFields}
        value={inner}
        onChange={(v) => {
          setInner(v);
          onChange(v);
        }}
      />
    </div>
  );
};


const ValueInput: React.FC<{
  name: string;
  type: FieldType;
  expr: Expr;
  parentFields: ValueMap;
  value?: Value;
  onChange: (v: Value) => void;
}> = ({ name, type, expr, parentFields, value, onChange }) => {
  switch (type.kind) {
    case "i8": return <I8Input name={name} value={value} onChange={onChange} />;
    case "i16": return <I16Input name={name} value={value} onChange={onChange} />;
    case "i32": return <I32Input name={name} value={value} onChange={onChange} />;
    case "i64": return <I64Input name={name} value={value} onChange={onChange} />;
    case "f32": return <F32Input name={name} value={value} onChange={onChange} />;
    case "f64": return <F64Input name={name} value={value} onChange={onChange} />;
    case "CString":
    case "HebrewString": return <StringInput name={name} value={value} onChange={onChange} />;
    case "Struct": {
      const struct = expr.get(type.name);
      if (!struct) return <div className="error-message">Struct '{type.name}' not found</div>;
      return <StructInput name={name} struct={struct} expr={expr} value={value} onChange={onChange} />;
    }
    case "Enum": return <EnumInput name={name} type={type} expr={expr} value={value} onChange={onChange} />;
    case "Match": return <MatchInput name={name} type={type} expr={expr} parentFields={parentFields} value={value} onChange={onChange} />;
    case "Array": return <ArrayInput name={name} type={type.elementType} length={type.length} expr={expr} parentFields={parentFields} value={value} onChange={onChange} />;
  }
  return null;
};



interface ValueFormProps {
  structName: string;
  expr: Expr;
  isSocketReady: boolean;
  onSubmit: (value: Value) => void;
}

const ValueForm: React.FC<ValueFormProps> = ({ structName, expr, isSocketReady, onSubmit }) => {
  const [fields, setFields] = useState<ValueMap>({});
  const struct = expr.get(structName);

  if (!struct) {
    return <div className="loading-message">Missing struct {structName}</div>;
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit(fields);
  };

  const currentSize = expr.defaultSizeOf(
    { kind: "Struct", name: structName },
    fields
  );

  return (
    <div className="form-container">
      <h2 className="form-title">Building: {structName}</h2>
      <div className="struct-size">
        Current Size: {currentSize} bytes
      </div>

      <form onSubmit={handleSubmit}>
        <StructInput
          name={structName}
          struct={struct}
          expr={expr}
          onChange={(value: ValueMap) => setFields(value)}
        />

        <div className="form-actions">
          <button
            type="submit"
            disabled={!isSocketReady}
            className="submit-button"
          >
            {!isSocketReady ? "WebSocket Disconnected" : "Send to WebSocket"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ValueForm;
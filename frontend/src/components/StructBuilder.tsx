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

export const IntegerInput: React.FC<{
  name: string;
  signed: boolean;
  width: number;
  defaultNumber: number;
  value?: Value;
  onChange: (v: Value) => void;
}> = ({ name, signed, width, value, defaultNumber, onChange }) => {
  const typeKind = `${signed ? "i" : "u"}${width}`;

  // text buffer + error message
  const [text, setText] = useState<string>(
    value !== undefined && typeof value === "bigint"
      ? value.toString()
      : defaultNumber.toString()
  );
  const [error, setError] = useState<string | null>(null);

  // compute min/max as BigInt
  const maxUnsigned = (1n << BigInt(width)) - 1n;
  const minSigned = -(1n << BigInt(width - 1));
  const maxSigned = (1n << BigInt(width - 1)) - 1n;

  const handleChange = (t: string) => {
    setText(t);

    if (t === "" || t === "-" && signed) {
      // empty or just "-" is allowed as partial
      setError(null);
      return;
    }

    try {
      const bi = BigInt(t);

      // range check
      if (!signed) {
        if (bi < 0n || bi > maxUnsigned) {
          setError(`Must be 0 … ${maxUnsigned}`);
          return;
        }
      } else {
        if (bi < minSigned || bi > maxSigned) {
          setError(`Must be ${minSigned} … ${maxSigned}`);
          return;
        }
      }

      // okay
      setError(null);
      onChange(bi);
    } catch {
      // not a valid bigint yet
      setError(null);
    }
  };

  return wrapInput(
    name,
    typeKind,
    <>
      <input
        type="text"
        inputMode="numeric"
        pattern={signed ? "[0-9\\-]*" : "[0-9]*"}
        value={text}
        className={`field-input integer-value ${error ? "invalid" : ""}`}
        onChange={(e) => handleChange(e.target.value)}
      />
      {error && <div className="field-error">{error}</div>}
    </>
  );
};

export const FloatInput: React.FC<{
  name: string;
  width: 32 | 64;
  defaultNumber: number,
  value?: Value;
  onChange: (v: Value) => void;
}> = ({ name, width, value, defaultNumber, onChange }) => {
  const typeKind = `F${width}`;

  const [text, setText] = useState<string>(
    value !== undefined && typeof value === "number"
      ? value.toString()
      : defaultNumber.toString()
  );

  return wrapInput(
    name,
    typeKind,
    <input
      type="text"
      inputMode="decimal"
      value={text}
      className="field-input float-value"
      onChange={(e) => {
        const t = e.target.value;
        setText(t);

        if (t === "") {
          onChange(0);
        }
        const n = parseFloat(t);
        if (!Number.isNaN(n)) {
          onChange(n);
        }
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

  const defaultKey = useMemo(() => {
    return expr.defaultValue(type) as string;
  }, [expr, type]);

  const [selected, setSelected] = useState<string>(() => {
    if (typeof value === "string" && enumDef?.has(value)) {
      return value;
    }
    return defaultKey;
  });

  useEffect(() => {
    const isValid = typeof value === "string" && enumDef?.has(value);
    const newSelected = isValid ? (value) : defaultKey;
    setSelected(newSelected);

    if (!isValid) {
      onChange(defaultKey);
    }
  }, [value, defaultKey, enumDef, onChange]);


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
        {[...enumDef.keys()].map(label => (
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
    case "Int": return <IntegerInput name={name} width={type.width} signed={type.signed} defaultNumber={type.default ?? 0} value={value} onChange={onChange} />;
    case "f32": return <FloatInput name={name} width={32} value={value} defaultNumber={type.default ?? 0} onChange={onChange} />;
    case "f64": return <FloatInput name={name} width={32} value={value} defaultNumber={type.default ?? 0} onChange={onChange} />;
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



export default function StructBuilder({
  structName,
  expr,
  isSocketReady,
  onSubmit,
}: {
  structName: string;
  expr: Expr;
  isSocketReady: boolean;
  onSubmit: (value: Value) => void;
}) {
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
import React, { useEffect, useRef, useState } from "react";
import { Expr, Value, FieldType, Struct } from "./expr";

interface ValueInputProps {
  name: string;
  type: FieldType;
  expr: Expr;
  onChange: (value: Value) => void;
  onReady?: (ready: boolean) => void;
}

const wrapInput = (name: string, typeKind: string, input: React.ReactNode) => (
  <div className="field-container">
    <label className="field-label">
      {name}: <span className="field-type">{typeKind}</span>
    </label>
    {input}
  </div>
);

const I8Input = ({ name, value, onChange }: { name: string; value: number; onChange: (v: Value) => void }) =>
  wrapInput(name, "I8",
    <input
      type="number"
      min={-128}
      max={127}
      value={value}
      className="field-input"
      onChange={(e) => onChange({ kind: "I8", value: parseInt(e.target.value) || 0 })}
    />);

const I16Input = ({ name, value, onChange }: { name: string; value: number; onChange: (v: Value) => void }) =>
  wrapInput(name, "I16",
    <input
      type="number"
      min={-32768}
      max={32767}
      value={value}
      className="field-input"
      onChange={(e) => onChange({ kind: "I16", value: parseInt(e.target.value) || 0 })}
    />);

const I32Input = ({ name, value, onChange }: { name: string; value: number; onChange: (v: Value) => void }) =>
  wrapInput(name, "I32",
    <input
      type="number"
      value={value}
      className="field-input"
      onChange={(e) => onChange({ kind: "I32", value: parseInt(e.target.value) || 0 })}
    />);

const I64Input = ({ name, value, onChange }: { name: string; value: bigint; onChange: (v: Value) => void }) =>
  wrapInput(name, "I64",
    <input
      type="number"
      value={Number(value)}
      className="field-input"
      onChange={(e) => {
        try {
          onChange({ kind: "I64", value: BigInt(e.target.value || 0) });
        } catch {
          onChange({ kind: "I64", value: BigInt(0) });
        }
      }}
    />);

const F32Input = ({ name, value, onChange }: { name: string; value: number; onChange: (v: Value) => void }) =>
  wrapInput(name, "F32",
    <input
      type="number"
      step="any"
      value={value}
      className="field-input"
      onChange={(e) => onChange({ kind: "F32", value: parseFloat(e.target.value) || 0 })}
    />);

const F64Input = ({ name, value, onChange }: { name: string; value: number; onChange: (v: Value) => void }) =>
  wrapInput(name, "F64",
    <input
      type="number"
      step="any"
      value={value}
      className="field-input"
      onChange={(e) => onChange({ kind: "F64", value: parseFloat(e.target.value) || 0 })}
    />);

const StructInput = ({ name, structName, struct, expr, value, onChange}: { 
  name: string; 
  structName: string; 
  struct: Struct; 
  expr: Expr; 
  value: Value;
  onChange: (v: Value) => void; 
}) => {
  if (value.kind !== "Struct") return null;

  return (
    <div className="struct-container">
      <div className="struct-header">
        <span className="struct-name">{name}</span>
      </div>
      <div className="struct-fields">
        {struct.fields.map(([fieldName, fieldType]) => (
          <ValueInput
            key={fieldName}
            name={fieldName}
            type={fieldType}
            expr={expr}
            value={value.fields.get(fieldName) || expr.defaultValue(fieldType)}
            onChange={(v) => {
              const updated = new Map(value.fields);
              updated.set(fieldName, v);
              onChange({ kind: "Struct", name: structName, fields: updated });
            }}
          />
        ))}
      </div>
    </div>
  );
};

const EnumInput = ({
  name,
  enumName,
  base,
  expr,
  value,
  onChange
}: {
  name: string;
  enumName: string;
  expr: Expr;
  base: "I8" | "I16" | "I32" | "I64";
  value: string;
  onChange: (v: Value) => void;
}) => {
  const enumDef = expr.getEnum(enumName);

  if (!enumDef) {
    return <div className="error-message">Enum '{enumName}' not found</div>;
  }

  const entries = Array.from(enumDef); // [ ["Ok", 0], ["Fail", 1], ... ]

  return wrapInput(name, enumName,
    <select
      className="field-input"
      
      value={value}
      onChange={(e) => {
        const value = e.target.value;
        if (value !== "") {
          onChange({ kind: "Enum", name: enumName, base, value });
        }
      }}
    >
      <option value="" disabled hidden>
      </option>
      {entries.map(([label]) => (
        <option key={label} value={label}>
          {label}
        </option>
      ))}
    </select>
  );
};

const ValueInput: React.FC<ValueInputProps & { value: Value }> = ({ name, type, expr, value, onChange, onReady }) => {
  switch (type.kind) {
    case "I8": return <I8Input name={name} value={value.kind === "I8" ? value.value : 0} onChange={onChange} />;
    case "I16": return <I16Input name={name} value={value.kind === "I16" ? value.value : 0} onChange={onChange} />;
    case "I32": return <I32Input name={name} value={value.kind === "I32" ? value.value : 0} onChange={onChange} />;
    case "I64": return <I64Input name={name} value={value.kind === "I64" ? value.value : BigInt(0)} onChange={onChange} />;
    case "F32": return <F32Input name={name} value={value.kind === "F32" ? value.value : 0.0} onChange={onChange} />;
    case "F64": return <F64Input name={name} value={value.kind === "F64" ? value.value : 0.0} onChange={onChange} />;
    case "Struct": {
      const struct = expr.get(type.name);
      if (!struct) return <div className="error-message">Struct '{type.name}' not found</div>;
      return <StructInput name={name} structName={type.name} struct={struct} expr={expr} value={value} onChange={onChange} onReady={onReady} />;
    }
    case "Enum":
      return <EnumInput name={name} enumName={type.name} expr={expr} base={type.base} value={value.kind === "Enum" ? value.value : ""} onChange={onChange} />;
  }
};

interface ValueFormProps {
  structName: string;
  expr: Expr;
  isSocketReady: boolean;
  onSubmit: (value: Value) => void;
}

const ValueForm: React.FC<ValueFormProps> = ({ structName, expr, isSocketReady, onSubmit }) => {
  const [value, setValue] = useState<Value | null>(null);
  const struct = expr.get(structName);

  useEffect(() => {
    setValue(expr.defaultValue({ kind: "Struct", name: structName }));
  }, [expr, structName]);

  if (!struct) {
    return <div className="error-message">Struct '{structName}' not found</div>;
  }

  const handleFieldChange = (fieldName: string, fieldValue: Value) => {
    if (!value || value.kind !== "Struct") return;
    const updated = new Map(value.fields);
    updated.set(fieldName, fieldValue);
    setValue({ kind: "Struct", name: structName, fields: updated });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (value) {
      onSubmit(value);
    }
  };

  return (
    <div className="form-container">
      <h2 className="form-title">Building: {structName}</h2>
      <div className="struct-size">Size: {expr.sizeof(structName)} bytes</div>

      <form onSubmit={handleSubmit}>
        {value && value.kind === "Struct" && (
          <div className="struct-container">
            <div className="struct-header">
              <span className="struct-name">{structName}</span>
            </div>
            <div className="struct-fields">
              {struct.fields.map(([fieldName, fieldType]) => (
                <ValueInput
                  key={fieldName}
                  name={fieldName}
                  type={fieldType}
                  expr={expr}
                  value={value.fields.get(fieldName) || expr.defaultValue(fieldType)}
                  onChange={(v) => handleFieldChange(fieldName, v)}
                />
              ))}
            </div>
          </div>
        )}

        <div className="form-actions">
          <button
            type="submit"
            disabled={!isSocketReady || !value}
            className={`submit-button ${!isSocketReady || !value ? 'disabled' : ''}`}
          >
            {!isSocketReady
              ? "WebSocket Disconnected"
              : !value
                ? "Fill Form to Submit"
                : "Send to WebSocket"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ValueForm;

import React, { useEffect, useState } from "react";
import { Expr, Value, FieldType, Struct } from "./expr";


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
      onChange={(e) => onChange({ kind: "i8", value: parseInt(e.target.value) || 0 })}
    />
  );


const I16Input = ({ name, value, onChange }: { name: string; value: number, onChange: (v: Value) => void }) =>
  wrapInput(name, "I16",
    <input
      type="number"
      min={-32768}
      max={32767}
      value={value}
      className="field-input"
      onChange={(e) => onChange({ kind: "i16", value: parseInt(e.target.value) || 0 })}
    />
  );

const I32Input = ({ name, value, onChange }: { name: string; value: number; onChange: (v: Value) => void }) =>
  wrapInput(name, "I32",
    <input
      type="number"
      className="field-input"
      value={value}
      onChange={(e) => onChange({ kind: "i32", value: parseInt(e.target.value) || 0 })}
    />
  );

const I64Input = ({ name, value, onChange }: { name: string; value: bigint; onChange: (v: Value) => void }) =>
  wrapInput(name, "I64",
    <input
      type="number"
      value={value.toString()}
      className="field-input"
      onChange={(e) => {
        try {
          onChange({ kind: "i64", value: BigInt(e.target.value || 0) });
        } catch {
          onChange({ kind: "i64", value: BigInt(0) });
        }
      }}
    />
  );

const F32Input = ({ name, value, onChange }: { name: string; value: number; onChange: (v: Value) => void }) =>
  wrapInput(name, "F32",
    <input
      type="number"
      step="any"
      value={value}
      className="field-input"
      onChange={(e) => onChange({ kind: "f32", value: parseFloat(e.target.value) || 0 })}
    />
  );

const F64Input = ({ name, value, onChange }: { name: string; value: number; onChange: (v: Value) => void }) =>
  wrapInput(name, "F64",
    <input
      type="number"
      step="any"
      value={value}
      className="field-input"
      onChange={(e) => onChange({ kind: "f64", value: parseFloat(e.target.value) || 0 })}
    />
  );

const StructInput = ({
  name,
  structName,
  struct,
  expr,
  value,
  onChange,
}: {
  name: string;
  structName: string;
  struct: Struct;
  expr: Expr;
  value: Value;
  onChange: (v: Value) => void;
}) => {
  const val =
    value.kind === "Struct" && value.name === structName
      ? value
      : expr.defaultValue({ kind: "Struct", name: structName });

  if (val.kind !== "Struct") return null;

  return (
    <div className="struct-container">
      <div className="struct-header">
        <span className="struct-name">{name}</span>
      </div>
      <div className="struct-fields">
        {struct.fields.map(([fieldName, fieldType]) => {
          const fieldValue = val.fields.get(fieldName) ?? expr.defaultValue(fieldType);
          return (
            <ValueInput
              key={fieldName}
              name={fieldName}
              type={fieldType}
              expr={expr}
              value={fieldValue}
              onChange={(v) => {
                const updated = new Map(val.fields);
                updated.set(fieldName, v);
                onChange({ kind: "Struct", name: structName, fields: updated });
              }}
              parentStruct={val}
            />
          );
        })}
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
  base: "i8" | "i16" | "i32" | "i64";
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

const MatchInput: React.FC<{
  name: string;
  type: Extract<FieldType, { kind: "Match" }>;
  expr: Expr;
  parentStruct: Extract<Value, { kind: "Struct" }>;
  value: Value
  onChange: (v: Value) => void;
}> = ({ name, type, expr, parentStruct,value, onChange }) => {
  const discriminantValue = parentStruct?.fields.get(type.discriminant);
  const selectedCase = discriminantValue?.kind === "Enum"
    ? type.cases.get(discriminantValue.value)
    : undefined;


  if (!selectedCase) {
    return <></>;
  }

  return (
    <div className="match-container">
      <ValueInput
        name={name}
        type={selectedCase}
        expr={expr}
        value={value}
        onChange={onChange}
        parentStruct={parentStruct}
      />
    </div>
  );
};


const ValueInput: React.FC<{
  name: string;
  type: FieldType;
  expr: Expr;
  value: Value;
  onChange: (value: Value) => void;
  parentStruct: Extract<Value, { kind: "Struct" }>;
}> = ({ name, type, expr, value, onChange, parentStruct }) => {
  switch (type.kind) {
    case "i8":
      return <I8Input name={name} value={value.kind == "i8" ? value.value : 0} onChange={onChange} />;
    case "i16":
      return <I16Input name={name} value={value.kind == "i16" ? value.value : 0} onChange={onChange} />;
    case "i32":
      return <I32Input name={name} value={value.kind == "i32" ? value.value : 0} onChange={onChange} />;
    case "i64":
      return <I64Input name={name} value={value.kind == "i64" ? value.value : BigInt(0)} onChange={onChange} />;
    case "f32":
      return <F32Input name={name} value={value.kind == "f32" ? value.value : 0} onChange={onChange} />;
    case "f64":
      return <F64Input name={name} value={value.kind == "f64" ? value.value : 0} onChange={onChange} />;
    case "Struct": {
      const struct = expr.get(type.name);
      if (!struct)
        return <div className="error-message">Struct '{type.name}' not found</div>;
      return (
        <StructInput
          name={name}
          structName={type.name}
          struct={struct}
          expr={expr}
          value={value}
          onChange={onChange}
        />
      );
    }
    case "Enum":
      return (
        <EnumInput
          name={name}
          enumName={type.name}
          expr={expr}
          base={type.base}
          value={value.kind === "Enum" ? value.value : ""}
          onChange={onChange}
        />
      );
    case "Match":
      return (
        <MatchInput
          name={name}
          type={type}
          expr={expr}
          parentStruct={parentStruct}
          value={value}
          onChange={onChange}
        />
      );
  }
};


interface ValueFormProps {
  structName: string;
  expr: Expr;
  isSocketReady: boolean;
  onSubmit: (value: Value) => void;
}

const ValueForm: React.FC<ValueFormProps> = ({ structName, expr, isSocketReady, onSubmit }) => {
 const [value, setValue] = useState<{ structName: string; value: Value } | null>(null);
  const struct = expr.get(structName);

  useEffect(() => {
    const initial = expr.defaultValue({ kind: "Struct", name: structName });
    setValue({ structName, value: initial });
  }, [expr, structName]);


if (!struct || !value || value.structName !== structName || value.value.kind !== "Struct") {
  return <div className="loading-message">Loading form...</div>;
}

  const handleFieldChange = (fieldName: string, fieldValue: Value) => {
    if (!value || value.value.kind !== "Struct") return;
    const updated = new Map(value.value.fields);
    updated.set(fieldName, fieldValue);
    setValue({structName, value: { kind: "Struct", name: structName, fields: updated }});
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (value) {
      onSubmit(value.value);
    }
  };
  const v = value.value;
  return (
    <div className="form-container">
      <h2 className="form-title">Building: {structName}</h2>
      <div className="struct-size">Size: {expr.sizeof(structName)} bytes</div>

      <form onSubmit={handleSubmit}>
        {(
          <div className="struct-container">
            <div className="struct-header">
              <span className="struct-name">{structName}</span>
            </div>
            <div className="struct-fields">
              {struct.fields.map(([fieldName, fieldType]) => {
                const field = v.fields.get(fieldName)!;
                return (
                <ValueInput
                  key={fieldName}
                  name={fieldName}
                  type={fieldType}
                  expr={expr}
                  value={field}
                  onChange={(v) => handleFieldChange(fieldName, v)}
                  parentStruct = {v}
                />)}
              )}
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
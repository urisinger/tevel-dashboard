import React, { useEffect, useState } from "react";
import { Expr, Value, FieldType, Struct } from "../expr";

import './StructBuilder.css';

const wrapInput = (name: string, typeKind: string, input: React.ReactNode) => (
  <div className="field-container">
    <label className="field-label">
      {name}: <span className="field-type">{typeKind}</span>
    </label>
    {input}
  </div>
);

const I8Input = ({ name, onChange }: { name: string; onChange: (v: Value) => void }) =>
  wrapInput(name, "I8",
    <input
      type="number"
      min={-128}
      max={127}
      defaultValue={0}
      className="field-input"
      onChange={(e) => onChange({ kind: "i8", value: parseInt(e.target.value) || 0 })}
    />
  );


const I16Input = ({ name, onChange }: { name: string; onChange: (v: Value) => void }) =>
  wrapInput(name, "I16",
    <input
      type="number"
      min={-32768}
      max={32767}
      defaultValue={0}
      className="field-input"
      onChange={(e) => onChange({ kind: "i16", value: parseInt(e.target.value) || 0 })}
    />
  );

const I32Input = ({ name, onChange }: { name: string; onChange: (v: Value) => void }) =>
  wrapInput(name, "I32",
    <input
      type="number"
      className="field-input"
      defaultValue={0}
      onChange={(e) => onChange({ kind: "i32", value: parseInt(e.target.value) || 0 })}
    />
  );

const I64Input = ({ name, onChange }: { name: string; onChange: (v: Value) => void }) =>
  wrapInput(name, "I64",
    <input
      type="number"
      defaultValue={0}
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

const F32Input = ({ name, onChange }: { name: string; onChange: (v: Value) => void }) =>
  wrapInput(name, "F32",
    <input
      type="number"
      step="any"
      defaultValue={0}
      className="field-input"
      onChange={(e) => onChange({ kind: "f32", value: parseFloat(e.target.value) || 0 })}
    />
  );

const F64Input = ({ name, onChange }: { name: string; onChange: (v: Value) => void }) =>
  wrapInput(name, "F64",
    <input
      type="number"
      step="any"
      defaultValue={0}
      className="field-input"
      onChange={(e) => onChange({ kind: "f64", value: parseFloat(e.target.value) || 0 })}
    />
  );

const StructInput = ({
  name,
  structName,
  struct,
  expr,
  onChange,
}: {
  name: string;
  structName: string;
  struct: Struct;
  expr: Expr;
  onChange: (v: Value) => void;
}) => {
  const [fields, setFields] = useState<Map<string, Value>>(new Map());

  const purgeDependentMatches = (
    discriminantName: string,
    map: Map<string, Value>
  ) => {
    for (const [fname, ftype] of struct.fields) {
      if (ftype.kind === "Match" && ftype.discriminant === discriminantName) {
        map.delete(fname);
      }
    }
  };

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
            parentFields={fields}
            onChange={(v) => {
              const updated = new Map(fields);
              updated.set(fieldName, v);

              /** if this field is an Enum → clean its Match dependents */
              if (fieldType.kind === "Enum") {
                purgeDependentMatches(fieldName, updated);
              }

              setFields(updated);
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
  onChange
}: {
  name: string;
  enumName: string;
  expr: Expr;
  base: "i8" | "i16" | "i32" | "i64";
  onChange: (v: Value) => void;
}) => {
  const enumDef = expr.getEnum(enumName);

  if (!enumDef) {
    return <div className="error-message">Enum '{enumName}' not found</div>;
  }

  const entries = Array.from(enumDef); // [ ["Ok", 0], ["Fail", 1], ... ]



  const [selected, setSelected] = useState(entries[0][0]);

  return wrapInput(name, enumName,
    <select
      className="field-input"
      value={selected}
      onChange={(e) => {
        const value = e.target.value;
        setSelected(value);
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
  parentFields: Map<string, Value> | null;
  onChange: (v: Value) => void;
}> = ({ name, type, expr, parentFields, onChange }) => {
  const discriminantValue = parentFields?.get(type.discriminant);
  const enumKey =
    discriminantValue?.kind === "Enum"
      ? discriminantValue.value
      : Array.from(type.cases.keys())[0];
  const selectedCase = type.cases.get(enumKey)!;





  return (
    <div className="match-container">
      <ValueInput
        name={name}
        type={selectedCase}
        expr={expr}
        onChange={onChange}
        parentFields={parentFields}
      />
    </div>
  );
};


const ValueInput: React.FC<{
  name: string;
  type: FieldType;
  expr: Expr;
  onChange: (value: Value) => void;
  parentFields: Map<string, Value> | null;
}> = ({ name, type, expr, onChange, parentFields }) => {
  switch (type.kind) {
    case "i8":
      return <I8Input name={name} onChange={onChange} />;
    case "i16":
      return <I16Input name={name} onChange={onChange} />;
    case "i32":
      return <I32Input name={name} onChange={onChange} />;
    case "i64":
      return <I64Input name={name} onChange={onChange} />;
    case "f32":
      return <F32Input name={name} onChange={onChange} />;
    case "f64":
      return <F64Input name={name} onChange={onChange} />;
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
          onChange={onChange}
        />
      );
    case "Match":
      return (
        <MatchInput
          name={name}
          type={type}
          expr={expr}
          parentFields={parentFields}
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
  const [fields, setFields] = useState<Map<string, Value>>(new Map());
  const struct = expr.get(structName);

  if (!struct) {
    return <div className="loading-message">Loading form...</div>;
  }

  const purgeDependentMatches = (discriminantName: string, map: Map<string, Value>) => {
    for (const [fieldName, fieldType] of struct.fields) {
      if (fieldType.kind === "Match" && fieldType.discriminant === discriminantName) {
        map.delete(fieldName); // 🧹 remove stale field
      }
    }
  };

  const handleFieldChange = (fieldName: string, fieldValue: Value) => {
    const updated = new Map(fields);
    updated.set(fieldName, fieldValue);

    const fieldType = struct.fields.find(([name]) => name === fieldName)?.[1];
    if (fieldType?.kind === "Enum") {
      purgeDependentMatches(fieldName, updated);
    }

    setFields(updated);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit({ kind: "Struct", fields, name: structName });
  };

  const currentSize = expr.sizeOf({ kind: "Struct", name: structName }, {
    value: { kind: "Struct" as const, name: structName, fields },
    mode: "default"
  });

  return (
    <div className="form-container">
      <h2 className="form-title">Building: {structName}</h2>
      <div className="struct-size">
        Current Size: {currentSize} bytes
      </div>

      <form onSubmit={handleSubmit}>
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
                onChange={(v) => handleFieldChange(fieldName, v)}
                parentFields={fields}
              />
            ))}
          </div>
        </div>

        <div className="form-actions">
          <button
            type="submit"
            disabled={!isSocketReady}
            className={`submit-button`}
          >
            {!isSocketReady ? "WebSocket Disconnected" : "Send to WebSocket"}
          </button>
        </div>
      </form>
    </div>
  );
};


export default ValueForm;

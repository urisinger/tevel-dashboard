import React, { useEffect, useMemo, useState } from "react";
import { Expr, Value, FieldType, Struct, ValueMap, ArrayLength } from "../expr";

import './StructBuilder.css';

const wrapInput = (name: string, typeKind: string, input: React.ReactNode) => (
  <div className="field-container">
    <label className="field-label">
      {name}: <span className="field-type">{typeKind}</span>
    </label>
    {input}
  </div>
);

const I8Input = ({ name, onChange }: { name: string; onChange: (v: number) => void }) =>
  wrapInput(name, "I8",
    <input
      type="number"
      min={-128}
      max={127}
      defaultValue={0}
      className="field-input integer-value"
      onChange={(e) => onChange(parseInt(e.target.value) || 0)}
    />
  );


const I16Input = ({ name, onChange }: { name: string; onChange: (v: number) => void }) =>
  wrapInput(name, "I16",
    <input
      type="number"
      min={-32768}
      max={32767}
      defaultValue={0}
      className="field-input integer-value"
      onChange={(e) => onChange(parseInt(e.target.value) || 0)}
    />
  );

const I32Input = ({ name, onChange }: { name: string; onChange: (v: number) => void }) =>
  wrapInput(name, "I32",
    <input
      type="number"
      className="field-input integer-value"
      defaultValue={0}
      onChange={(e) => onChange(parseInt(e.target.value) || 0)}
    />
  );

const I64Input = ({ name, onChange }: { name: string; onChange: (v: bigint) => void }) =>
  wrapInput(name, "I64",
    <input
      type="number"
      defaultValue={0}
      className="field-input bigint-value"
      onChange={(e) => {
        try {
          onChange(BigInt(e.target.value || 0));
        } catch {
          onChange(BigInt(0));
        }
      }}
    />
  );

const F32Input = ({ name, onChange }: { name: string; onChange: (v: number) => void }) =>
  wrapInput(name, "F32",
    <input
      type="number"
      step="any"
      defaultValue={0}
      className="field-input float-value"
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
    />
  );

const F64Input = ({ name, onChange }: { name: string; onChange: (v: number) => void }) =>
  wrapInput(name, "F64",
    <input
      type="number"
      step="any"
      defaultValue={0}
      className="field-input float-value"
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
    />
  );

const StructInput = ({
  name,
  struct,
  expr,
  onChange,
}: {
  name: string;
  struct: Struct;
  expr: Expr;
  onChange: (v: ValueMap) => void;
}) => {
  const [fields, setFields] = useState<ValueMap>({});

  const purgeDependents = (
    discriminantName: string,
    map: ValueMap
  ) => {
    for (const [fname, ftype] of struct.fields) {
      if (ftype.kind === "Array" && ftype.length.kind === "Dynamic" && ftype.length.field === discriminantName) {
        delete map[fname];
      }
      if (ftype.kind === "Match" && ftype.discriminant === discriminantName) {
        delete map[fname];
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
              const updated = { ...fields };
              updated[fieldName] = v;

              console.log(updated);
              purgeDependents(fieldName, updated);


              console.log(updated);

              setFields(updated);
              onChange(updated);
            }}
          />
        ))}
      </div>
    </div>
  );
};



const ArrayInput = ({
  name,
  type,
  length,
  expr,
  parentFields,
  onChange,
}: {
  name: string;
  type: FieldType;
  length: ArrayLength;
  expr: Expr;
  parentFields: ValueMap;
  onChange: (v: Value[]) => void;
}) => {

  const computedLength = useMemo(() => {
    if (length.kind === "Static") return length.value;
    const fieldValue = parentFields[length.field];
    if (typeof fieldValue === "number") return fieldValue;
    if (typeof fieldValue === "bigint") return Number(fieldValue);
    return 0;
  }, [length, parentFields]);

  const [items, setItems] = useState<Value[]>(() =>
    Array.from({ length: computedLength }, () =>
      expr.defaultValue(type, parentFields)
    )
  );

  useEffect(() => {
    setItems((prev) =>
      Array.from({ length: computedLength }, (_, i) =>
        prev[i] ?? expr.defaultValue(type, parentFields)
      )
    );
  }, [computedLength, expr, type, parentFields]);


  return (
    <div className="struct-container">
      <div className="struct-header">
        <span className="struct-name">{name}</span>
      </div>

      <div className="struct-fields">
        {items.map((value, i) => (
          <ValueInput
            key={i}
            name={`${name}[${i}]`}
            type={type}
            expr={expr}
            parentFields={parentFields}
            onChange={(v) => {
              const updated = [...items];
              console.log(updated);
              updated[i] = v;
              setItems(updated);
              onChange(updated);
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
  expr,
  onChange,
}: {
  name: string;
  enumName: string;
  expr: Expr;
  onChange: (v: string) => void;
}) => {
  const enumDef = expr.getEnum(enumName);

  const entries = useMemo(() => {
    return enumDef ? Array.from(enumDef) : [];
  }, [enumDef]);

  const [selected, setSelected] = useState(entries[0]?.[0] ?? "");

  useEffect(() => {
    if (entries.length > 0) {
      setSelected(entries[0][0]);
    }
  }, [entries]);

  if (!enumDef) {
    return <div className="error-message">Enum '{enumName}' not found</div>;
  }

  return wrapInput(
    name,
    enumName,
    <select
      className="field-input enum-value"
      value={selected}
      onChange={(e) => {
        const value = e.target.value;
        setSelected(value);
        if (value !== "") {
          onChange(value);
        }
      }}
    >
      <option value="" disabled hidden />
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
  parentFields: ValueMap;
  onChange: (v: Value) => void;
}> = ({ name, type, expr, parentFields, onChange }) => {

  const discriminantValue = parentFields[type.discriminant];

  const enumKey =
    typeof discriminantValue === "string"
      ? discriminantValue
      : expr.getEnum(type.enumTypeName)?.keys().next().value;


  const selectedCase = type.cases[enumKey]!;


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
  parentFields: ValueMap;
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
    case "Array":
      return (<ArrayInput
        name={name}
        type={type.elementType}
        length={type.length}
        expr={expr}
        parentFields={parentFields}
        onChange={onChange}
      />);

  }
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
    return <div className="loading-message">Loading form...</div>;
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit(fields);
  };

  const currentSize = expr.sizeOf(
    { kind: "Struct", name: structName },
    { value: fields, mode: "default" }
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
          onChange={(value) => setFields(value)}
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

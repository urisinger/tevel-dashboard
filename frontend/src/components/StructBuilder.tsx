import { createSignal, createEffect, createMemo, For, JSX } from "solid-js";
import { Expr, Value, FieldType, Struct, ValueMap, ArrayLength, isValueMap } from "../expr";
import "./StructBuilder.css";
import "./shared.css";

function wrapInput(name: string, typeKind: string, input: JSX.Element) {
  return (
    <div class="field-container">
      <label class="field-label">
        {name}: <span class="field-type">{typeKind}</span>
      </label>
      {input}
    </div>
  );
}

// ========== Inputs ==========

function IntegerInput(props: {
  name: string;
  signed: boolean;
  width: number;
  defaultNumber: number;
  value?: Value;
  onChange: (v: Value) => void;
}): JSX.Element {
  const { name, signed, width, defaultNumber, value, onChange } = props;
  const typeKind = `${signed ? "i" : "u"}${width}`;
  const [text, setText] = createSignal(
    value !== undefined && typeof value === "bigint"
      ? value.toString()
      : defaultNumber.toString()
  );
  const [error, setError] = createSignal<string | null>(null);

  const maxUnsigned = (1n << BigInt(width)) - 1n;
  const minSigned = -(1n << BigInt(width - 1));
  const maxSigned = (1n << BigInt(width - 1)) - 1n;

  const handleChange = (t: string) => {
    setText(t);
    if (t === "" || (t === "-" && signed)) {
      setError(null);
      return;
    }
    try {
      const bi = BigInt(t);
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
      setError(null);
      onChange(bi);
    } catch {
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
        value={text()}
        class={`field-input integer-value ${error() ? "invalid" : ""}`}
        onInput={(e) => handleChange((e.target as HTMLInputElement).value)}
      />
      {error() && <div class="field-error">{error()}</div>}
    </>
  );
}

function FloatInput(props: {
  name: string;
  width: 32 | 64;
  defaultNumber: number;
  value?: Value;
  onChange: (v: Value) => void;
}): JSX.Element {
  const { name, width, defaultNumber, value, onChange } = props;
  const typeKind = `F${width}`;
  const [text, setText] = createSignal(
    value !== undefined && typeof value === "number"
      ? value.toString()
      : defaultNumber.toString()
  );

  const handle = (t: string) => {
    setText(t);
    if (t === "") {
      onChange(0);
      return;
    }
    const n = parseFloat(t);
    if (!Number.isNaN(n)) onChange(n);
  };

  return wrapInput(
    name,
    typeKind,
    <input
      type="text"
      inputMode="decimal"
      value={text()}
      class="field-input float-value"
      onInput={(e) => handle((e.target as HTMLInputElement).value)}
    />
  );
}

function StringInput(props: {
  name: string;
  value?: Value;
  onChange: (v: Value) => void;
}): JSX.Element {
  const { name, value, onChange } = props;
  const isStr = (v: Value): v is string => typeof v === "string";
  const [val, setVal] = createSignal(
    value !== undefined && isStr(value) ? value : ""
  );
  createEffect(() => {
    if (value !== undefined && isStr(value)) setVal(value);
  });

  return wrapInput(
    name,
    "String",
    <input
      type="text"
      value={val()}
      class="field-input string-value"
      onInput={(e) => {
        const s = (e.target as HTMLInputElement).value;
        setVal(s);
        onChange(s);
      }}
    />
  );
}

// ========== Recursive Inputs ==========

function StructInput(props: {
  name: string;
  struct: Struct;
  expr: Expr;
  value?: Value;
  onChange: (v: ValueMap) => void;
}): JSX.Element {
  const { name, struct, expr, value, onChange } = props;
  const initial = createMemo(() =>
    isValueMap(value) ? (value as ValueMap) : {}
  );
  const [fields, setFields] = createSignal<ValueMap>(initial());
  createEffect(() => {
    if (isValueMap(value)) setFields(value as ValueMap);
  });

  return (
    <div class="struct-container">
      <div class="struct-header">
        <span class="struct-name">{name}</span>
      </div>
      <div class="struct-fields">
        <For each={struct.fields}>
          {([fname, ftype]) => (
            <ValueInput
              name={fname}
              type={ftype}
              expr={expr}
              parentFields={fields()}
              value={fields()[fname]}
              onChange={(v) => {
                const nxt = { ...fields(), [fname]: v };
                setFields(nxt);
                onChange(nxt);
              }}
            />
          )}
        </For>
      </div>
    </div>
  );
}

function ArrayInput(props: {
  name: string;
  type: FieldType;
  length: ArrayLength;
  expr: Expr;
  parentFields: ValueMap;
  value?: Value;
  onChange: (v: (Value | undefined)[]) => void;
}): JSX.Element {
  const { name, type, length, expr, parentFields, value, onChange } = props;
  const computedLength = createMemo(() => {
    if (length.kind === "Static") return length.value;
    const v = parentFields[length.field];
    return typeof v === "number"
      ? v
      : typeof v === "bigint"
        ? Number(v)
        : 0;
  });

  const initialItems = createMemo(() =>
    Array.isArray(value) && (value as Value[]).length === computedLength()
      ? (value as Value[])
      : Array.from(
        { length: computedLength() },
        () => expr.defaultValue(type, parentFields)
      )
  );
  const [items, setItems] = createSignal<Value[]>(initialItems());
  createEffect(() => {
    setItems((prev) =>
      Array.from({ length: computedLength() }, (_, i) =>
        prev[i] ?? expr.defaultValue(type, parentFields)
      )
    );
  });
  createEffect(() => {
    if (
      Array.isArray(value) &&
      (value as Value[]).length === computedLength()
    ) {
      setItems(value as Value[]);
    }
  });

  return (
    <div class="struct-container">
      <div class="struct-header">
        <span class="struct-name">{name}</span>
      </div>
      <div class="struct-fields">
        <For each={items()}>
          {(it, i) => (
            <ValueInput
              name={`${name}[${i()}]`}
              type={type}
              expr={expr}
              parentFields={parentFields}
              value={it}
              onChange={(v) => {
                const nxt = [...items()];
                nxt[i()] = v;
                setItems(nxt);
                onChange(nxt);
              }}
            />
          )}
        </For>
      </div>
    </div>
  );
}

// ========== Other Inputs: Enum & Match ==========
// (similar pattern; left out for brevity)

// ========== ValueInput dispatcher ==========

function ValueInput(props: {
  name: string;
  type: FieldType;
  expr: Expr;
  parentFields: ValueMap;
  value?: Value;
  onChange: (v: Value) => void;
}): JSX.Element | null {
  const { name, type, expr, parentFields, value, onChange } = props;
  switch (type.kind) {
    case "Int":
      return (
        <IntegerInput
          name={name}
          signed={type.signed}
          width={type.width}
          defaultNumber={type.default ?? 0}
          value={value}
          onChange={onChange}
        />
      );
    case "f32":
    case "f64":
      return (
        <FloatInput
          name={name}
          width={type.kind === "f64" ? 64 : 32}
          defaultNumber={type.default ?? 0}
          value={value}
          onChange={onChange}
        />
      );
    case "CString":
    case "HebrewString":
      return <StringInput name={name} value={value} onChange={onChange} />;
    case "Struct":
      const struct = expr.get(type.name);
      return struct ? (
        <StructInput
          name={name}
          struct={struct}
          expr={expr}
          value={value}
          onChange={onChange as any}
        />
      ) : null;
    case "Enum":
      // EnumInput in Solid would follow same pattern
      return null;
    case "Match":
      // MatchInput in Solid would follow same pattern
      return null;
    case "Array":
      return (
        <ArrayInput
          name={name}
          type={type}
          length={type.length}
          expr={expr}
          parentFields={parentFields}
          value={value}
          onChange={onChange as any}
        />
      );
  }
  return null;
}

export default function StructBuilder(props: {
  structName: string;
  expr: Expr;
  isSocketReady: boolean;
  onSubmit: (value: Value) => void;
}): JSX.Element | null {
  const { structName, expr, isSocketReady, onSubmit } = props;
  const [fields, setFields] = createSignal<ValueMap>({});
  const struct = expr.get(structName);

  if (!struct) return <div class="loading-message">Missing struct {structName}</div>;

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    onSubmit(fields());
  };

  const currentSize = createMemo(() =>
    expr.defaultSizeOf({ kind: "Struct", name: structName }, fields())
  );

  return (
    <div class="form-container">
      <h2 class="form-title">Building: {structName}</h2>
      <div class="struct-size">Current Size: {currentSize()} bytes</div>

      <form onSubmit={handleSubmit}>
        <StructInput
          name={structName}
          struct={struct}
          expr={expr}
          onChange={(v) => setFields(v)}
        />

        <div class="form-actions">
          <button type="submit" disabled={!isSocketReady} class="submit-button">
            {!isSocketReady ? "Socket Disconnected" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}

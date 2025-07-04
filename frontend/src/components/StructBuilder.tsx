import { createSignal, createEffect, createMemo, For, JSX, Switch, Match, Show, Accessor } from "solid-js";
import { Expr, Value, FieldType, Struct, ValueMap, ArrayLength, isValueMap } from "../expr";
import "./StructBuilder.css";
import "./shared.css";

function wrapInput(name: Accessor<string>, typeKind: Accessor<string>, input: JSX.Element) {
  return (
    <div class="field-container">
      <label class="field-label">
        {name()}: <span class="field-type">{typeKind()}</span>
      </label>
      {input}
    </div>
  );
}


function IntegerInput(props: {
  name: string;
  signed: boolean;
  width: number;
  defaultNumber: number;
  value?: Value;
  onChange: (v: Value) => void;
}): JSX.Element {
  const getInitialText = () =>
    typeof props.value === "bigint"
      ? props.value.toString()
      : props.defaultNumber.toString();

  const [text, setText] = createSignal<string>(getInitialText());

  const [error, setError] = createSignal<string | null>(null);

  const maxUnsigned = () => (1n << BigInt(props.width)) - 1n;
  const minSigned = () => -(1n << BigInt(props.width - 1));
  const maxSigned = () => (1n << BigInt(props.width - 1)) - 1n;

  const handleChange = (t: string) => {
    setText(t);
    if (t === "" || (t === "-" && props.signed)) {
      setError(null);
      return;
    }
    try {
      const bi = BigInt(t);
      if (!props.signed) {
        if (bi < 0n || bi > maxUnsigned()) {
          setError(`Must be 0 … ${maxUnsigned()}`);
          return;
        }
      } else {
        if (bi < minSigned() || bi > maxSigned()) {
          setError(`Must be ${minSigned()} … ${maxSigned()}`);
          return;
        }
      }
      setError(null);
      props.onChange(bi);
    } catch {
      setError(null);
    }
  };

  return wrapInput(
    () => props.name,
    () => `${props.signed ? "i" : "u"}${props.width}`,
    <>
      <input
        type="text"
        inputMode="numeric"
        pattern={props.signed ? "[0-9\\-]*" : "[0-9]*"}
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
  const getInitialText = () =>
    typeof props.value === "number"
      ? props.value.toString()
      : props.defaultNumber.toString();

  const [text, setText] = createSignal<string>(getInitialText());

  const handle = (t: string) => {
    setText(t);
    if (t === "") {
      props.onChange(0);
      return;
    }
    const n = parseFloat(t);
    if (!Number.isNaN(n)) props.onChange(n);
  };

  return wrapInput(
    () => props.name,
    () => `F${props.width}`,
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
  const isStr = (v: Value): v is string => typeof v === "string";
  const getInitialText = () =>
    props.value !== undefined && isStr(props.value) ? props.value : "";

  const [val, setVal] = createSignal<string>(getInitialText());

  createEffect(() => {
    if (props.value !== undefined && isStr(props.value)) setVal(props.value);
  });

  return wrapInput(
    () => props.name,
    () => "String",
    <input
      type="text"
      value={val()}
      class="field-input string-value"
      onInput={(e) => {
        const s = (e.target as HTMLInputElement).value;
        setVal(s);
        props.onChange(s);
      }}
    />
  );
}

function EnumInput(props: {
  name: string;
  type: Extract<FieldType, { kind: "Enum" }>;
  expr: Expr;
  value?: Value;
  onChange: (v: string) => void;
}): JSX.Element {
  const enumDef = createMemo(() => props.expr.getEnum(props.type.name));
  const defaultKey = createMemo(() => props.expr.defaultValue(props.type) as string);

  const selectedKey = createMemo(() => {
    const v = props.value;
    return typeof v === "string" && enumDef()?.has(v) ? v : defaultKey();
  });

  return (
    <Show
      when={enumDef()}
      fallback={<div class="error-message">Enum “{props.type.name}” not found</div>}
    >
      {(enumDef) => (
        <div class="field-container">
          <label class="field-label">
            {props.name}: <span class="field-type">{props.type.name}</span>
          </label>
          <select
            class="field-input enum-value"
            value={selectedKey()}
            onChange={(e) => props.onChange(e.currentTarget.value)}
          >
            <For each={[...enumDef().keys()]}>
              {(key) => <option value={key}>{key}</option>}
            </For>
          </select>
        </div>
      )}
    </Show>
  );
}

function StructInput(props: {
  name: string;
  struct: Struct;
  expr: Expr;
  value?: Value;
  onChange: (v: ValueMap) => void;
}): JSX.Element {
  const initial = createMemo(() => isValueMap(props.value) ? props.value : {});
  const [fields, setFields] = createSignal<ValueMap>(initial());
  createEffect(() => {
    if (isValueMap(props.value)) setFields(props.value);
  });

  return (
    <div class="struct-container">
      <div class="struct-header">
        <span class="struct-name">{props.name}</span>
      </div>
      <div class="struct-fields">
        <For each={props.struct.fields}>
          {([fname, ftype]) => (
            <ValueInput
              name={fname}
              type={ftype}
              expr={props.expr}
              parentFields={fields()}
              value={fields()[fname]}
              onChange={(v) => {
                const nxt = { ...fields(), [fname]: v };
                setFields(nxt);
                props.onChange(nxt);
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
  const length = createMemo(() => {
    if (props.length.kind === "Static") return props.length.value;
    const v = props.parentFields[props.length.field];
    return typeof v === "number" ? v : typeof v === "bigint" ? Number(v) : 0;
  })

  const items = createMemo<Value[]>(() => {
    const len = length();
    const defaultValue = props.expr.defaultValue(props.type, props.parentFields);
    if (Array.isArray(props.value) && props.value.length === len) return props.value as Value[];
    return Array.from({ length: len }, () => defaultValue);
  })

  return (
    <div class="struct-container">
      <div class="struct-header">
        <span class="struct-name">{props.name}</span>
      </div>
      <div class="struct-fields">
        <For each={items()}>
          {(it, i) => (
            <ValueInput
              name={`${props.name}[${i()}]`}
              type={props.type}
              expr={props.expr}
              parentFields={props.parentFields}
              value={it}
              onChange={(v) => {
                const nxt = [...items()];
                nxt[i()] = v;
                props.onChange(nxt);
              }}
            />
          )}
        </For>
      </div>
    </div>
  );
}

function MatchInput(props: {
  name: string;
  type: Extract<FieldType, { kind: "Match" }>;
  expr: Expr;
  parentFields: ValueMap;
  value?: Value;
  onChange: (v: Value) => void;
}): JSX.Element {
  const enumKey = createMemo(() => {
    const d = props.parentFields[props.type.discriminant];
    return typeof d === "string"
      ? d
      : props.expr.getEnum(props.type.enumTypeName)?.keys().next().value;
  });

  const caseType = createMemo(() => enumKey() != undefined ? props.type.cases[enumKey()!] : undefined);

  const innerValue = createMemo(() => {
    if (caseType() == undefined) return undefined;
    if (props.expr.valueMatchesType(props.value, caseType()!)) return props.value;
    return undefined;
  });

  return (
    <Switch>
      <Match when={!enumKey()}>
        <div class="error-message">
          No valid enum key for <strong>{props.type.discriminant}</strong>
        </div>
      </Match>

      <Match when={!caseType()}>
        <div class="error-message">
          No case for enum value <strong>{enumKey()}</strong>
        </div>
      </Match>

      <Match when={true}>
        <div class="match-container">
          <ValueInput
            name={props.name}
            type={caseType()!}
            expr={props.expr}
            parentFields={props.parentFields}
            value={innerValue()}
            onChange={props.onChange}
          />
        </div>
      </Match>
    </Switch>
  );
}

function ValueInput(props: {
  name: string;
  type: FieldType;
  expr: Expr;
  parentFields: ValueMap;
  value?: Value;
  onChange: (v: Value) => void;
}): JSX.Element | null {
  return (
    <Switch>
      <Match when={props.type.kind === "Int" ? props.type : undefined}>
        {(type) => <IntegerInput
          name={props.name}
          signed={type().signed}
          width={type().width}
          defaultNumber={type().default ?? 0}
          value={props.value}
          onChange={props.onChange}
        />}
      </Match>

      <Match when={props.type.kind === "f32" || props.type.kind === "f64" ? props.type : undefined}>
        {(type) => <FloatInput
          name={props.name}
          width={type().kind === "f64" ? 64 : 32}
          defaultNumber={type().default ?? 0}
          value={props.value}
          onChange={props.onChange}
        />}
      </Match>

      <Match when={props.type.kind === "CString" || props.type.kind === "HebrewString"}>
        <StringInput
          name={props.name}
          value={props.value}
          onChange={props.onChange}
        />
      </Match>

      <Match when={props.type.kind === "Struct" ? props.type : undefined}>
        {(type) => {
          const structDef = props.expr.get(type().name);
          return structDef ? (
            <StructInput
              name={props.name}
              struct={structDef}
              expr={props.expr}
              value={props.value}
              onChange={props.onChange}
            />
          ) : <div class="error-message">Struct “{type().name}” not found</div>;
        }}
      </Match>

      <Match when={props.type.kind === "Enum" ? props.type : undefined}>
        {(type) => <EnumInput
          name={props.name}
          type={type()}
          expr={props.expr}
          value={props.value}
          onChange={(v) => props.onChange(v)}
        />}
      </Match>

      <Match when={props.type.kind === "Match" ? props.type : undefined}>
        {(type) => <MatchInput
          name={props.name}
          type={type()}
          expr={props.expr}
          parentFields={props.parentFields}
          value={props.value}
          onChange={(v) => props.onChange(v)}
        />}
      </Match>

      <Match when={props.type.kind === "Array" ? props.type : undefined}>
        {(type) => <ArrayInput
          name={props.name}
          type={type().elementType}
          length={type().length}
          expr={props.expr}
          parentFields={props.parentFields}
          value={props.value as Value[]}
          onChange={(arr) => props.onChange(arr as unknown as Value)}
        />}
      </Match>
    </Switch>
  );
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

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    onSubmit(fields());
  };

  const currentSize = createMemo(() =>
    expr.defaultSizeOf({ kind: "Struct", name: structName }, fields())
  );

  return (
    <Show
      when={struct}
      fallback={<div class="loading-message">Missing struct {structName}</div>}
    >
      <div class="form-container">
        <h2 class="form-title">Building: {structName}</h2>
        <div class="struct-size">Current Size: {currentSize()} bytes</div>

        <form onSubmit={handleSubmit}>
          <StructInput
            name={structName}
            struct={struct!}
            expr={expr}
            onChange={(v) => setFields(v)}
          />

          <div class="form-actions">
            <button type="submit" disabled={!isSocketReady} class="submit-button">
              {isSocketReady ? "Send" : "Socket Disconnected"}
            </button>
          </div>
        </form>
      </div>
    </Show>
  );
}

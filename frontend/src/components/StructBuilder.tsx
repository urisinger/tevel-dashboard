import { createSignal, createMemo, For, JSX, Switch, Match, Accessor } from "solid-js";
import { Expr, Value, FieldType, ValueMap, ArrayLength, Value as ExprValue, ArgumentValue } from "../expr";
import "./StructBuilder.css";
import "./shared.css";

// Primitive inputs (stateless)
function IntInput(props: { value: Accessor<bigint>; setValue: (v: bigint) => void; signed: boolean; width: number }): JSX.Element {
  return (
    <input
      type="number"
      value={props.value().toString()}
      onInput={(e) => props.setValue(BigInt((e.target as HTMLInputElement).value || "0"))}
    />
  );
}

function FloatInput(props: { value: Accessor<number>; setValue: (v: number) => void }): JSX.Element {
  return (
    <input
      type="number"
      step="any"
      value={props.value()}
      onInput={(e) => props.setValue(parseFloat((e.target as HTMLInputElement).value) || 0)}
    />
  );
}

function StringInput(props: { value: Accessor<string>; setValue: (v: string) => void }): JSX.Element {
  return (
    <input
      type="text"
      value={props.value()}
      onInput={(e) => props.setValue((e.target as HTMLInputElement).value)}
    />
  );
}

function EnumInput(props: { value: Accessor<string>; setValue: (v: string) => void; expr: Expr; enumName: string }): JSX.Element {
  const enumDef = props.expr.getEnum(props.enumName);
  if (!enumDef) return <div>Unknown enum: {props.enumName}</div>;
  const keysMemo = createMemo(() => [...enumDef.keys()]);
  return (
    <select value={props.value()} onChange={(e) => props.setValue(e.currentTarget.value)}>
      <For each={keysMemo()}>
        {(key) => <option value={key}>{key}</option>}
      </For>
    </select>
  );
}

// Main value input router (stateless)
function ValueInput(props: {
  name: string;
  type: FieldType;
  value: Accessor<Value>;
  setValue: (v: Value) => void;
  expr: Expr;
  allFields: Accessor<ValueMap>;
}): JSX.Element {
  return (
    <div class="field-container">
      <label class="field-label">{props.name}:</label>
      <Switch>
        <Match when={props.type.kind === "Int"}>
          <IntInput
            value={() => props.value() as bigint}
            setValue={props.setValue as (v: bigint) => void}
            signed={(props.type as Extract<FieldType, { kind: "Int" }>).signed}
            width={(props.type as Extract<FieldType, { kind: "Int" }>).width}
          />
        </Match>

        <Match when={props.type.kind === "f32" || props.type.kind === "f64"}>
          <FloatInput
            value={() => props.value() as number}
            setValue={props.setValue as (v: number) => void}
          />
        </Match>

        <Match when={props.type.kind === "CString" || props.type.kind === "HebrewString"}>
          <StringInput
            value={() => props.value() as string}
            setValue={props.setValue as (v: string) => void}
          />
        </Match>

        <Match when={props.type.kind === "Enum"}>
          <EnumInput
            value={() => props.value() as string}
            setValue={props.setValue as (v: string) => void}
            expr={props.expr}
            enumName={(props.type as Extract<FieldType, { kind: "Enum" }>).name}
          />
        </Match>

        <Match when={props.type.kind === "Array"}>
          <ArrayInput
            name={props.name}
            type={(props.type as Extract<FieldType, { kind: "Array" }>).elementType}
            length={(props.type as Extract<FieldType, { kind: "Array" }>).length}
            value={() => (props.value() as Value[]) || []}
            setValue={props.setValue as (v: Value[]) => void}
            expr={props.expr}
            allFields={props.allFields}
          />
        </Match>

        <Match when={props.type.kind === "Struct"}>
          <StructInput
            name={props.name}
            type={(props.type as {name: string; arguments?: ArgumentValue[]})}
            value={() => (props.value() as ValueMap) || {}}
            setValue={props.setValue as (v: ValueMap) => void}
            expr={props.expr}
            allFields={props.allFields}
          />
        </Match>

        <Match when={props.type.kind === "Match"}>
          <MatchInput
            name={props.name}
            type={props.type as Extract<FieldType, { kind: "Match" }>}
            value={props.value}
            setValue={props.setValue}
            expr={props.expr}
            allFields={props.allFields}
          />
        </Match>
      </Switch>
    </div>
  );
}

function ArrayInput(props: {
  name: string;
  type: FieldType;
  length: ArrayLength;
  value: Accessor<Value[]>;
  setValue: (v: Value[]) => void;
  expr: Expr;
  allFields: Accessor<ValueMap>;
}): JSX.Element {
  const lengthMemo = createMemo(() => {
    if (props.length.kind === "Static") return props.length.value;
    const fieldValue = props.allFields()[props.length.field];
    return typeof fieldValue === "number" ? fieldValue : typeof fieldValue === "bigint" ? Number(fieldValue) : 0;
  });

  const itemDefault = createMemo(() => props.expr.defaultValue(props.type, props.allFields()));

  return (
    <div class="array-container">
      <div class="array-header">{props.name} (length: {lengthMemo()})</div>
      <For each={Array.from({ length: lengthMemo() }, (_, i) => i)}>
        {(i) => (
          <ValueInput
            name={`${props.name}[${i}]`}
            type={props.type}
            value={() => props.value()[i] ?? itemDefault()}
            setValue={(v) => {
              const arr = [...props.value()];
              arr[i] = v;
              props.setValue(arr);
            }}
            expr={props.expr}
            allFields={props.allFields}
          />
        )}
      </For>
    </div>
  );
}

function StructInput(props: {
  name: string;
  type: {name: string; arguments?: ArgumentValue[]};
  value: Accessor<ValueMap>;
  setValue: (v: ValueMap) => void;
  expr: Expr;
  allFields: Accessor<ValueMap>;
}): JSX.Element {
  const struct = createMemo(() => props.expr.get(props.type.name));
  if (!struct) return <div>Unknown struct: {props.type.name}</div>;

  // Resolve parameters (if any) using current value and parent allFields
  const resolvedParams = createMemo<ValueMap>(() => {
    const result: ValueMap = {};
    const s = struct();
    if (!s) return result;
    const params = s.parameters ?? [];
    const args = props.type.arguments ?? [];

    const value = props.value();

    params.forEach((param, idx) => {
      const arg = args[idx];
      if (!arg) return;
      if (arg.kind === "Literal") {
        result[param.name] = arg.value;
      } else {
        const name = arg.name as string;
        if (name in value) result[param.name] = value[name];
      }
    });

    return result;
  });

  const combinedAllFields = createMemo<ValueMap>(() => ({
    ...props.value(),
    ...resolvedParams(),
  }));

  return (
    <div class="struct-container">
      <div class="struct-header">{props.name}</div>
      <For each={struct()?.fields}>
        {([fieldName, fieldType]) => (
          <ValueInput
            name={fieldName}
            type={fieldType}
            value={() => props.value()[fieldName] ?? props.expr.defaultValue(fieldType, combinedAllFields())}
            setValue={(v) => props.setValue({ ...props.value(), [fieldName]: v })}
            expr={props.expr}
            allFields={() => combinedAllFields()}
          />
        )}
      </For>
    </div>
  );
}

function MatchInput(props: {
  name: string;
  type: Extract<FieldType, { kind: "Match" }>;
  value: Accessor<Value>;
  setValue: (v: Value) => void;
  expr: Expr;
  allFields: Accessor<ValueMap>;
}): JSX.Element {
  const enumKey = createMemo(() => {
    console.log("allFields", props.allFields());
    console.log("discriminant", props.type.discriminant);
    const d = props.allFields()[props.type.discriminant];
    if (typeof d === "string") return d;
    const first = props.expr.getEnum(props.type.enumTypeName)?.keys().next().value;
    console.log("enumKey", first);
    return first;
  });

  const caseType = () => (enumKey() ? props.type.cases[enumKey() as string] : undefined);

  return (
    <Switch>
      <Match when={!enumKey()}>
        <div class="error-message">
          No valid enum key for <strong>{props.type.discriminant}</strong>
        </div>
      </Match>

      <Match when={!caseType()}>
        <div class="error-message">No case for enum value <strong>{String(enumKey())}</strong></div>
      </Match>

      <Match when={true}>
        <ValueInput
          name={props.name}
          type={caseType() as FieldType}
          value={props.value}
          setValue={props.setValue}
          expr={props.expr}
          allFields={props.allFields}
        />
      </Match>
    </Switch>
  );
}

// Main StructBuilder component
export default function StructBuilder(props: {
  structName: string;
  expr: Expr;
  isSocketReady: boolean;
  onSubmit: (value: Value) => void;
}): JSX.Element {
  const struct = props.expr.get(props.structName);
  if (!struct) return <div>Unknown struct: {props.structName}</div>;

  // Initialize all fields with default values
  const initFields = (): ValueMap => {
    const fields: ValueMap = {};
    for (const [fieldName, fieldType] of struct.fields) {
      fields[fieldName] = props.expr.defaultValue(fieldType, {});
    }
    return fields;
  };

  const [fields, setFields] = createSignal<ValueMap>(initFields());

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    props.onSubmit(fields());
  };

  return (
    <div class="form-container">
      <h2 class="form-title">Building: {props.structName}</h2>

      <form onSubmit={handleSubmit}>
        <For each={struct.fields}>
          {([fieldName, fieldType]) => (
            <ValueInput
              name={fieldName}
              type={fieldType}
              value={() => fields()[fieldName]}
              setValue={(v) => {
                const newFields = { ...fields() };
                newFields[fieldName] = v;
                console.log("newFields", newFields);
                setFields(newFields);
              }}
              expr={props.expr}
              allFields={() => fields()}
            />
          )}
        </For>

        <div class="form-actions">
          <button type="submit" disabled={!props.isSocketReady} class="submit-button">
            {props.isSocketReady ? "Send" : "Socket Disconnected"}
          </button>
        </div>
      </form>
    </div>
  );
}
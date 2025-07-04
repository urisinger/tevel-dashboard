import { For, JSX, Switch, Match, Show } from "solid-js";
import { Expr, FieldType, Value, ValueMap } from "../expr";
import "./StructViewer.css";
import "./shared.css";

export default function StructViewer(props: {
    name?: string;
    value: Value | undefined;
    type: FieldType;
    expr: Expr;
    parentFields?: ValueMap;
}): JSX.Element | null {


    const renderPrimitive = () => {
        if (typeof props.value === "object") return null;

        const label = props.name && <label class="field-label">{props.name}</label>;
        const display = props.value?.toString() ?? "—";

        let typeLabel: string;
        if (props.type.kind === "Int") typeLabel = `${props.type.signed ? "i" : "u"}${props.type.width}`;
        else if (props.type.kind === "Enum") typeLabel = `${props.type.name}<${props.type.width}>`;
        else typeLabel = props.type.kind;

        const classMap: Record<string, string> = {
            Int: "integer-value",
            Enum: "enum-value",
            f32: "float-value",
            f64: "float-value",
            CString: "string-value",
            HebrewString: "string-value",
        };
        const className = classMap[props.type.kind] ?? "unknown-value";

        return (
            <div class="field-container">
                {label}
                <div class={`primitive-value ${className}`}>
                    <span class="value-content">{display}</span>
                    <span class="value-type">{typeLabel}</span>
                </div>
            </div>
        );
    };

    return (
        <Switch>
            <Match when={props.type.kind === "Struct" ? props.type : undefined}>
                {(type) => <Show
                    when={props.expr.get(type().name)}
                    fallback={
                        <div class="error-message">Unknown struct: {type().name}</div>
                    }
                >
                    {(struct) => {
                        const fieldMap = props.value as ValueMap;
                        return (
                            <div class="struct-container">
                                {props.name && <div class="struct-header">{props.name}</div>}
                                <div class="struct-fields">
                                    <For each={struct().fields}>
                                        {([fieldName, fieldType]) => (
                                            <StructViewer
                                                name={fieldName}
                                                value={fieldMap[fieldName]}
                                                type={fieldType}
                                                expr={props.expr}
                                                parentFields={fieldMap}
                                            />
                                        )}
                                    </For>
                                </div>
                            </div>
                        );
                    }}
                </Show>
                }
            </Match>

            <Match when={props.type.kind === "Match" ? props.type : undefined}>
                {(type) => {
                    const discr = props.parentFields?.[type().discriminant];
                    const key =
                        typeof discr === "string"
                            ? discr
                            : props.expr.getEnum(type().enumTypeName)?.keys().next().value;
                    const caseType = key && type().cases[key];
                    return caseType ? (
                        <StructViewer
                            name={props.name}
                            value={props.value}
                            type={caseType}
                            expr={props.expr}
                            parentFields={props.parentFields}
                        />
                    ) : (
                        <div class="error-message">
                            Invalid match case for {props.name}: {String(key)}
                        </div>
                    );
                }}
            </Match>

            <Match when={props.type.kind === "Array" ? props.type : undefined}>
                {(type) => {
                    const items = Array.isArray(props.value) ? (props.value as Value[]) : [];
                    return (
                        <div class="struct-container">
                            {props.name && <div class="struct-header">{props.name}</div>}
                            <div class="struct-fields">
                                <For each={items}>
                                    {(item, i) => (
                                        <StructViewer
                                            name={`${props.name}[${i()}]`}
                                            value={item}
                                            type={type().elementType}
                                            expr={props.expr}
                                            parentFields={props.parentFields}
                                        />
                                    )}
                                </For>
                            </div>
                        </div>
                    );
                }}
            </Match>

            <Match when={true}>{renderPrimitive()}</Match>
        </Switch>
    );
}

import { Expr, FieldType, Value, ValueMap } from "../expr";
import React from "react";
import './StructViewer.css';
import './shared.css';


const StructViewer: React.FC<{
    name?: string;
    value: Value | undefined;
    type: FieldType;
    expr: Expr;
    parentFields?: ValueMap;
}> = ({
    name,
    value,
    type,
    expr,
    parentFields,
}) => {
        const label = name && <label className="field-label">{name}</label>;

        switch (type.kind) {
            case "Struct": {
                const struct = expr.get(type.name);
                if (!struct || typeof struct !== "object") {
                    return <div className="error-message">Unknown struct: {type.name}</div>;
                }

                if (!value) {
                    return undefined;
                }
                const fieldMap = value as ValueMap;

                return (
                    <div className="struct-container">
                        {name && <div className="struct-header">{name}</div>}
                        <div className="struct-fields">
                            {struct.fields.map(([fieldName, fieldType]) => (
                                <StructViewer
                                    key={fieldName}
                                    name={fieldName}
                                    value={fieldMap[fieldName]}
                                    type={fieldType}
                                    expr={expr}
                                    parentFields={fieldMap}
                                />
                            ))}
                        </div>
                    </div>
                );
            }

            case "Match": {
                const discr = parentFields?.[type.discriminant];
                const key = typeof discr === "string"
                    ? discr
                    : expr.getEnum(type.enumTypeName)?.keys().next().value;

                const caseType = key ? type.cases[key] : undefined;
                if (!caseType) {
                    return (
                        <div className="error-message">
                            Invalid match case for {name}: {String(key)}
                        </div>
                    );
                }

                return (
                    <StructViewer
                        name={name}
                        value={value}
                        type={caseType}
                        expr={expr}
                        parentFields={parentFields}
                    />
                );
            }

            case "Array": {
                const items = Array.isArray(value) ? value : [];
                return (
                    <div className="struct-container">
                        {name && <div className="struct-header">{name}</div>}
                        <div className="struct-fields">
                            {items.map((item, i) => (
                                <StructViewer
                                    key={i}
                                    name={`${name}[${i}]`}
                                    value={item}
                                    type={type.elementType}
                                    expr={expr}
                                    parentFields={parentFields}
                                />
                            ))}
                        </div>
                    </div>
                );
            }

            default: {
                if (typeof value === "object") return undefined;

                const display = value?.toString() ?? "—";

                let typeLabel: string;
                if (type.kind === "Int") {
                    typeLabel = `${type.signed ? "i" : "u"}${type.width}`;
                } else if (type.kind === "Enum") {
                    typeLabel = `${type.name}<${type.width}>`;
                } else {
                    typeLabel = type.kind;
                }

                const classMap: Record<string, string> = {
                    Int: "integer-value",
                    Enum: "enum-value",
                    f32: "float-value",
                    f64: "float-value",
                    CString: "string-value",
                    HebrewString: "string-value",
                };

                const className = classMap[type.kind] || "unknown-value";

                return (
                    <div className="field-container">
                        {label}
                        <div className={`primitive-value ${className}`}>
                            <span className="value-content">{display}</span>
                            <span className="value-type">{typeLabel}</span>
                        </div>
                    </div>
                );
            }
        };
    }


export default StructViewer;

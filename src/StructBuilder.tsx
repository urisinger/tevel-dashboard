import React from "react";
import { Expr } from "./expr";

interface StructBuilderProps {
  // The layout name of the struct (key in expr.layouts)
  structLayout: string;
  expr: Expr;
  formData: { [key: string]: string };
  setFormData: React.Dispatch<React.SetStateAction<{ [key: string]: string }>>;
  // The prefix is used to build nested field names (e.g., "person.age")
  prefix: string;
}

const StructBuilder: React.FC<StructBuilderProps> = ({
  structLayout,
  expr,
  formData,
  setFormData,
  prefix,
}) => {
  const layout = expr.layouts[structLayout];
  if (!layout) return null;

  const handleChange = (fieldName: string, value: string) => {
    // Build the full field name using the prefix.
    const fullName = prefix ? `${prefix}.${fieldName}` : fieldName;
    setFormData((prev) => ({ ...prev, [fullName]: value }));
  };

  return (
    <div>
      {layout.fields.map(([name, ty]) => {
        const fullName = prefix ? `${prefix}.${name}` : name;
        if (ty.kind === "Struct") {
          return (
            <fieldset key={fullName}>
              <legend>{fullName}</legend>
              <StructBuilder
                structLayout={ty.name}
                expr={expr}
                formData={formData}
                setFormData={setFormData}
                prefix={fullName}
              />
            </fieldset>
          );
        } else if (
          ty.kind === "I8" ||
          ty.kind === "I16" ||
          ty.kind === "I32" ||
          ty.kind === "I64"
        ) {
          return (
            <div key={fullName}>
              <label>{fullName}</label>
              <input
                type="number"
                step="1"
                value={formData[fullName] || "0"}
                onChange={(ev) => handleChange(name, ev.target.value)}
              />
            </div>
          );
        } else if (ty.kind === "F32" || ty.kind === "F64") {
          return (
            <div key={fullName}>
              <label>{fullName}</label>
              <input
                type="number"
                step="any"
                value={formData[fullName] || "0.0"}
                onChange={(ev) => handleChange(name, ev.target.value)}
              />
            </div>
          );
        } else {
          return null;
        }
      })}
    </div>
  );
};

export default StructBuilder;

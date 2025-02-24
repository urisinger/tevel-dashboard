// buildValueFromForm.ts
import { Expr, Struct, Value } from "./expr";

function buildValueFromForm(
  formData: { [key: string]: string },
  layout: Struct,
  expr: Expr,
  prefix: string
): Value {
  const fields: [string, Value][] = [];

  for (const [name, ty] of layout.fields) {
    const fullName = prefix ? `${prefix}.${name}` : name;
    const data = formData[fullName];

    let parsedValue: Value;
    console.log(ty.kind);
    switch (ty.kind) {
      case "I8":
        if (data === undefined) {
          throw new Error(`Missing value for ${fullName}`);
        }
        parsedValue = { kind: "I8", value: parseInt(data, 10) };
        break;
      case "I16":
        if (data === undefined) {
          throw new Error(`Missing value for ${fullName}`);
        }
        parsedValue = { kind: "I16", value: parseInt(data, 10) };
        break;
      case "I32":
        if (data === undefined) {
          throw new Error(`Missing value for ${fullName}`);
        }
        parsedValue = { kind: "I32", value: parseInt(data, 10) };
        break;
      case "I64":
        if (data === undefined) {
          throw new Error(`Missing value for ${fullName}`);
        }
        parsedValue = { kind: "I64", value: BigInt(data) };
        break;
      case "F32":
        if (data === undefined) {
          throw new Error(`Missing value for ${fullName}`);
        }
        parsedValue = { kind: "F32", value: parseFloat(data) };
        break;
      case "F64":
        if (data === undefined) {
          throw new Error(`Missing value for ${fullName}`);
        }
        parsedValue = { kind: "F64", value: parseFloat(data) };
        break;
      case "Struct": {
        const innerLayout = expr.layouts[ty.name];
        if (!innerLayout) {
          throw new Error(`Unknown struct: ${ty.name}`);
        }
        parsedValue = buildValueFromForm(formData, innerLayout, expr, fullName);
        break;
      }
      default:
        throw new Error(`Unsupported type for field ${fullName}`);
    }
    fields.push([fullName, parsedValue]);
  }

  return { kind: "Struct", fields };
}

export default buildValueFromForm;

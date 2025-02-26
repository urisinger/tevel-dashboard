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

    let value = 0;
    let value_float = 0.0;

    let parsedValue: Value;
    switch (ty.kind) {
      case "I8":
        if (data !== undefined) {
          value = parseInt(data, 10)
        }
        parsedValue = { kind: "I8", value };
        break;
      case "I16":
        if (data !== undefined) {
          value = parseInt(data, 10)
        }
        parsedValue = { kind: "I16", value };
        break;
      case "I32":
        if (data !== undefined) {
          value = parseInt(data, 10)
        }
        parsedValue = { kind: "I32", value };
        break;
      case "I64":
        let big_value = BigInt(0);
        if (data !== undefined) {
           big_value = BigInt(data)
        }
        parsedValue = { kind: "I64", value: big_value };
        break;
      case "F32":
        if (data !== undefined) {
          value_float = parseFloat(data)
        }
        parsedValue = { kind: "F32", value: value_float };
        break;
      case "F64":
        if (data !== undefined) {
          value_float = parseFloat(data)
        }
        parsedValue = { kind: "F64", value: value_float };
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

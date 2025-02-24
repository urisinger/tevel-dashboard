import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'


import { parser ,Expr, FieldType, Struct} from "./expr.ts"; // Your generated parser from Peggy/PEG.js

// The input string to parse.
const input = `
  struct Person {
    age: i32,
    height: f64,
    name: i8
  }

  struct Employee {
    id: i64,
    person: Person
  }
`;

// Parse the input and build an Expr instance.
let expr: Expr;
try {
  // Parse returns an array of struct definitions.
  const parsedStructs = parser.parse(input) as Array<{ name: string; fields: [string, string][] }>;

  // Convert the parsed structs into a layouts object.
  const layouts: { [name: string]: Struct } = {};
  parsedStructs.forEach((struct) => {
    layouts[struct.name] = {
      fields: struct.fields.map(([fieldName, typeStr]) => {
        let fieldType: FieldType;
        switch (typeStr) {
          case "i8":
            fieldType = { kind: "I8" };
            break;
          case "i16":
            fieldType = { kind: "I16" };
            break;
          case "i32":
            fieldType = { kind: "I32" };
            break;
          case "i64":
            fieldType = { kind: "I64" };
            break;
          case "f32":
            fieldType = { kind: "F32" };
            break;
          case "f64":
            fieldType = { kind: "F64" };
            break;
          default:
            // If not a known primitive, treat it as a user-defined struct.
            fieldType = { kind: "Struct", name: typeStr };
            break;
        }
        return [fieldName, fieldType];
      }),
    };
  });

  // Create an Expr instance from the layouts.
  expr = new Expr(layouts);
} catch (error) {
  console.error("Parsing error:", error);
  // In case of error, we fall back to an empty expression.
  expr = new Expr({});
}


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App expr={expr}/>
  </StrictMode>,
)

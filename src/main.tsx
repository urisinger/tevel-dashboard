import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'


import { parser ,Expr, FieldType, Struct} from "./expr.ts"; // Your generated parser from Peggy/PEG.js

// The input string to parse.
const input = `
  struct Person {
    type: i32,
    height: f64,
    name: i8
  }

  struct Employee {
    id: i64,
    l: T(i8),
    person: Person,
  }

  enum T{
    Lol = 1,
  }
`;

const expr = Expr.parse(input);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App expr={expr}/>
  </StrictMode>,
)

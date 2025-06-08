import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'


import { Expr, FieldType, Struct} from "./expr.ts"; // Your generated parser from Peggy/PEG.js

// The input string to parse.
const input = `
  struct Person {
    type: i32,
    height: f64,
  }

  struct Employee {
    id: i64,
    l: T(i8),
    person: match l {
      Lol => Person,
      V => i8
    }
  }

  enum T{
    Lol = 1,
    V = 2
  }
`;

const expr = Expr.parse(input);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App expr={expr}/>
  </StrictMode>,
)

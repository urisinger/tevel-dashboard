import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Expr } from "./expr.ts";

function Main() {
  const [expr, setExpr] = useState<Expr | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStructDefinition() {
      try {
        const response = await fetch('/struct.def');
        if (!response.ok) {
          throw new Error(`Failed to load struct definition: ${response.statusText}`);
        }
        const input = await response.text();
        const parsedExpr = Expr.parse(input);
        setExpr(parsedExpr);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load struct definition');
      } finally {
        setLoading(false);
      }
    }

    loadStructDefinition();
  }, []);

  if (loading) {
    return <div className="loading">Loading struct definition...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  if (!expr) {
    return <div className="error">No struct definition available</div>;
  }

  return (
    <StrictMode>
      <App expr={expr}/>
    </StrictMode>
  );
}

createRoot(document.getElementById('root')!).render(<Main />);
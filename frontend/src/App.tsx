import { StrictMode, useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "./Layout";
import HistoryPage from "./pages/HistoryPage";
import SendPage from './pages/SendPage'
import { Expr, FieldType } from "./expr";
import { WebSocketProvider } from './contexts/WebSocketProvider';
import './index.css'
import { ThemeProvider } from './contexts/ThemeContext';

function App() {
    const [expr, setExpr] = useState<Expr | undefined>();
    const [error, setError] = useState<string | undefined>();
    const [loading, setLoading] = useState(true);


  useEffect(() => {
    async function loadStructDefinition() {
      try {
        const response = await fetch('/api/structs.json');

        // Compile‐error HTML comes back with 422
        if (response.status === 422) {
          const html = await response.text();
          setError(html);        // set the raw HTML fragment
          return;
        }

        if (!response.ok) {
          throw new Error(`Failed to load struct definition (${response.status})`);
        }

        // Otherwise assume JSON
        const input = (await response.json()) as
          | { type: 'Struct'; name: string; fields: [string, FieldType][] }[]
          | { type: 'Enum';  name: string; entries: [string, number][] }[];

        const parsedExpr = new Expr(input);
        setExpr(parsedExpr);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }

    void loadStructDefinition();
  }, []);



    if (loading) {
        return <div className="loading">Loading struct definition...</div>;
    }

if (error) {
  return (
    <div
      className="error"
      dangerouslySetInnerHTML={{ __html: error }}
    />
  );
}

    if (!expr) {
        return <div className="error">No struct definition available</div>;
    }

    return (
        <StrictMode>
            <ThemeProvider>
                <WebSocketProvider>
                    <Router>
                        <Routes>
                            <Route path="/" element={<Layout />}>
                                <Route index element={<SendPage expr={expr} />} />
                                <Route path="history" element={<HistoryPage expr={expr} />} />
                            </Route>
                        </Routes>
                    </Router>
                </WebSocketProvider>
            </ThemeProvider>
        </StrictMode>
    );
};

export default App;

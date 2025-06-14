import React, { StrictMode, useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "./Layout";
import HistoryPage from "./pages/HistoryPage";
import SendPage from './pages/SendPage'
import { Expr } from "./expr";
import { WebSocketProvider } from './contexts/WebSocketProvider';
import './index.css'

function App() {
    const [expr, setExpr] = useState<Expr | undefined>();
    const [error, setError] = useState<string | undefined>();
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadStructDefinition() {
            try {
                const response = await fetch('/struct.json');
                if (!response.ok) {
                    throw new Error(`Failed to load struct definition: ${response.statusText}`);
                }
                const input = await response.json();
                const parsedExpr = new Expr(input);

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
        </StrictMode>
    );
};

export default App;
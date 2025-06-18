import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Expr, FieldType } from '../expr';
import './diagnostics.css'

export const ContentArea: React.FC = () => {
  const [expr, setExpr] = useState<Expr | undefined>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function loadStructDefinition() {
      try {
        const response = await fetch('/api/structs.json');
        if (response.status === 422) {
          setError(await response.text());
          return;
        }
        if (!response.ok) {
          throw new Error(`Failed to load struct definition (${response.status})`);
        }
        const input = (await response.json()) as
          [
            | { type: "Struct"; name: string; fields: [string, FieldType][] }
            | { type: "Enum"; name: string; entries: [string, number][] }
          ];
        setExpr(new Expr(input));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }
    void loadStructDefinition();
  }, []);

  useEffect(() => {
    if (!loading && !error && expr && window.location.pathname === '/') {
      void navigate('.', { replace: true });
    }
  }, [loading, error, expr, navigate]);

  if (loading) {
    return <div className="loading">Loading struct definition…</div>;
  }
  if (error) {
    return <div className="diagnosttic" dangerouslySetInnerHTML={{ __html: error }} />;
  }
  if (!expr) {
    return <div className="error">No struct definition available</div>;
  }

  return <Outlet context={expr} />;
};

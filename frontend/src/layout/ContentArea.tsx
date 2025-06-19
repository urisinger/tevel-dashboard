import React, { useState, useEffect } from 'react';
import { Outlet, } from 'react-router-dom';
import { Expr, FieldType } from '../expr';
import './diagnostics.css'

export const ContentArea: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const [expr, setExpr] = useState<Expr | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    async function loadStructDefinition() {
      setError(undefined);
      setExpr(undefined);

      const url = refreshKey === 0
        ? '/api/structs.json'
        : '/api/structs/refresh';

      const init: RequestInit = refreshKey === 0
        ? {}
        : { method: 'POST' };


      try {
        const response = await fetch(url, init);
        if (response.status === 422) {
          setError(await response.text());
          return;
        }
        if (!response.ok) {
          throw new Error(`Failed to load struct definition (${response.status})`);
        }
        const input = (await response.json()) as
          (| { type: 'Struct'; name: string; fields: [string, FieldType][] }
            | { type: 'Enum'; name: string; entries: [string, number][] })[];
        setExpr(new Expr(input));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }

    void loadStructDefinition();
  }, [refreshKey]);

  if (error) {
    return <div className="diagnostics" dangerouslySetInnerHTML={{ __html: error }} />;
  }
  if (!expr) {
    return <div className="loading">Loading struct definition…</div>;
  }

  return <Outlet context={expr} />;
};
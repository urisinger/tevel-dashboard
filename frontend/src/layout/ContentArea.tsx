import { createSignal, createEffect, JSX, Show } from "solid-js";
import { Outlet } from "solid-app-router";
import { Expr, FieldType } from "../expr";
import { ExprContext } from "../contexts/ExprContext";
import "./diagnostics.css";

export function ContentArea(props: { refreshKey: number }): JSX.Element {
  const [expr, setExpr] = createSignal<Expr | undefined>();
  const [error, setError] = createSignal<string>();

  createEffect(() => {
    const rk = props.refreshKey;
    setError(undefined);
    setExpr(undefined);

    const url =
      rk === 0 ? "/api/structs.json" : "/api/structs/refresh";
    const init: RequestInit = rk === 0 ? {} : { method: "POST" };

    fetch(url, init)
      .then(async (res) => {
        if (res.status === 422) {
          throw new Error(await res.text());
        }
        if (!res.ok) {
          throw new Error(`Failed to load struct definition (${res.status})`);
        }
        return res.json() as Promise<(
          | { type: "Struct"; name: string; fields: [string, FieldType][] }
          | { type: "Enum"; name: string; entries: [string, number][] }
        )[]>;
      })
      .then((input) => setExpr(new Expr(input)))
      .catch((err) => setError(err.message));
  });

  return (
    <ExprContext.Provider value={expr()}>
      <Show
        when={!error()}
        fallback={<div class="diagnostics" innerHTML={error()} />}
      >
        <Show
          when={expr() !== undefined}
          fallback={<div class="loading">Loading struct definition…</div>}
        >
          <Outlet />
        </Show>
      </Show>
    </ExprContext.Provider>
  );
}
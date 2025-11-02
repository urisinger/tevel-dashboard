import { JSX, Show, ParentProps, Switch, Match } from "solid-js";
import "./diagnostics.css";
import { expr } from "../state";
import { Expr } from "../expr";

export function ContentArea(props: ParentProps): JSX.Element {
  return (
    <Switch>
      <Match when={expr.loading}>
        <div class="loading">Loading struct definition…</div>
      </Match>
      
      <Match when={typeof expr() === "string"}>
        <div class="error-container">
          <div class="error-header">
            <h2>❌ Struct Definition Error</h2>
          </div>
          <div class="diagnostics" innerHTML={expr() as string} />
        </div>
      </Match>
      
      <Match when={expr() instanceof Expr}>
        {props.children}
      </Match>
    </Switch>
  );
}
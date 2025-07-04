import { JSX, Show, ParentProps } from "solid-js";
import "./diagnostics.css";
import { expr } from "../state";

export function ContentArea(props: ParentProps): JSX.Element {
  return (
    <Show
      when={expr()}
      fallback={<div class="loading">Loading struct definition…</div>}
    >
      {props.children}
    </Show>
  );
}
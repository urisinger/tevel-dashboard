import { A } from "@solidjs/router";
import { refetchExpr, theme, toggleTheme } from "../state";
import { JSX } from "solid-js";

export function Sidebar(): JSX.Element {
  return (
    <aside class="sidebar">
      <div class="sidebar-header">
        <button
          class="theme-toggle"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme() === "light" ? "dark" : "light"} mode`}
        >
          {theme() === "light" ? "🌙" : "☀️"}
        </button>
        <h2>Dashboard</h2>
        <button
          class="sidebar-item refresh-button"
          onClick={() => void refetchExpr()}
          aria-label="Refresh structs definition"
        >
          🔄
        </button>
      </div>
      <nav class="sidebar-content">
        <A
          href="/"
          class="sidebar-item"
        >
          Send
        </A>
        <A
          href="/history"
          class="sidebar-item"
        >
          History
        </A>
      </nav>
    </aside>
  );
}

export default Sidebar;

import { NavLink } from "solid-app-router";
import { theme, toggleTheme } from "../state";
import { JSX } from "solid-js";

export function Sidebar(props: { onRefresh: () => void }): JSX.Element {
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
          onClick={() => props.onRefresh()}
          aria-label="Refresh structs definition"
        >
          🔄
        </button>
      </div>
      <nav class="sidebar-content">
        <NavLink
          href="/"
        >
          Send
        </NavLink>
        <NavLink
          href="/history"
        >
          History
        </NavLink>
      </nav>
    </aside>
  );
}

export default Sidebar;

import { makeReconnectingWS, ReconnectingWebSocket } from "@solid-primitives/websocket";
import { createSignal } from "solid-js/types/server/reactive.js";

export const websocket: ReconnectingWebSocket = makeReconnectingWS(`ws://${window.location.host}/api/ws`, undefined, { delay: 500 });
export const [theme, setTheme] = createSignal<'light' | 'dark'>('dark');

export function toggleTheme() {
    setTheme((t) => (t === "light" ? "dark" : "light"));
}
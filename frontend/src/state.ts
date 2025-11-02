import { createWSState, makeReconnectingWS } from "@solid-primitives/websocket";
import { createResource, createSignal } from "solid-js";
import { Expr, FieldType } from "./expr";

export const websocket = makeReconnectingWS(`ws://${window.location.host}/api/ws/`, undefined, { delay: 10, retries: 3 });
export const socketReady = createWSState(websocket);
export const [theme, setTheme] = createSignal<'light' | 'dark'>('dark');

export function toggleTheme() {
    setTheme((t) => (t === "light" ? "dark" : "light"));
}

export const [expr, { refetch: refetchExpr }] = createResource<Expr | string>(
    async (_, { refetching }) => {
        console.log("refetching", refetching);
        const url =
            refetching ? "/api/structs/refresh" : "/api/structs.json";
        const init: RequestInit = refetching ? { method: "POST" } : {};

        try {
            const res = await fetch(url, init);

            if (res.status === 422) {
                return await res.text();
            }
            if (!res.ok) {
                return `Failed to load struct definition (${res.status})`;
            }
            
            const responseText = await res.text();
            
            let input;
            try {
                input = JSON.parse(responseText) as (
                    | { type: "Struct"; name: string; fields: [string, FieldType][] }
                    | { type: "Enum"; name: string; entries: [string, number][] }
                )[];
            } catch (jsonError) {
                return `Server returned invalid JSON. Response: ${responseText.slice(0, 200)}...`;
            }

            return new Expr(input);
        } catch (networkError) {
            return `Network error: ${networkError instanceof Error ? networkError.message : String(networkError)}`;
        }
    }
);
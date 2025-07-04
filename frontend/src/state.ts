import { makeReconnectingWS } from "@solid-primitives/websocket";
import { createResource, createSignal } from "solid-js";
import { Expr, FieldType } from "./expr";

export const websocket = makeReconnectingWS(`ws://${window.location.host}/api/ws/`, undefined, { delay: 10, retries: 3 });
export const [theme, setTheme] = createSignal<'light' | 'dark'>('dark');

export function toggleTheme() {
    setTheme((t) => (t === "light" ? "dark" : "light"));
}

export const [expr, { refetch: refetchExpr }] = createResource<Expr | Error>(
    async (_, { refetching }) => {
        console.log("refetching", refetching);
        const url =
            refetching ? "/api/structs/refresh" : "/api/structs.json";
        const init: RequestInit = refetching ? { method: "POST" } : {};

        const res = await fetch(url, init);

        if (res.status === 422) {
            throw new Error(await res.text());
        }
        if (!res.ok) {
            throw new Error(`Failed to load struct definition (${res.status})`);
        }
        const input = (await res.json()) as (
            | { type: "Struct"; name: string; fields: [string, FieldType][] }
            | { type: "Enum"; name: string; entries: [string, number][] }
        )[];

        return new Expr(input);
    }
);
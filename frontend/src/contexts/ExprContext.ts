import { createContext, useContext } from "solid-js";
import type { Expr } from "../expr";

export const ExprContext = createContext<Expr>();
export function useExpr() {
    const ctx = useContext(ExprContext);
    if (!ctx) throw new Error("useExpr must be used under ExprContext.Provider");
    return ctx;
}
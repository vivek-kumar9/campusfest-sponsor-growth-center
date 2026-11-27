"use client";
import { useCallback, useEffect, useRef, useState, createContext, useContext } from "react";

export const AsOfContext = createContext<{ asOf: string | null; setAsOf: (d: string | null) => void }>({ asOf: null, setAsOf: () => {} });
export const useAsOf = () => useContext(AsOfContext);

export function notifyChange() { if (typeof window !== "undefined") window.dispatchEvent(new Event("data-changed")); }

export async function api<T = any>(path: string, opts: { method?: string; body?: any } = {}): Promise<T> {
  const res = await fetch(path, { method: opts.method || "GET", headers: opts.body ? { "content-type": "application/json" } : undefined, body: opts.body ? JSON.stringify(opts.body) : undefined, cache: "no-store" });
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as T;
}

export async function mutate<T = any>(path: string, method: string, body?: any): Promise<T> {
  const r = await api<T>(path, { method, body }); notifyChange(); return r;
}

/** Fetch JSON for a path that depends on the as-of date; refetches when data changes anywhere in the app. */
export function useApi<T = any>(path: string | null, withAsOf = true) {
  const { asOf } = useAsOf();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const url = path ? (withAsOf && asOf ? `${path}${path.includes("?") ? "&" : "?"}asOf=${asOf}` : path) : null;
  const load = useCallback(async () => {
    if (!url) return; const my = ++seq.current; setLoading(true);
    try { const d = await api<T>(url); if (my === seq.current) { setData(d); setError(null); } }
    catch (e: any) { if (my === seq.current) setError(e.message); }
    finally { if (my === seq.current) setLoading(false); }
  }, [url]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const h = () => load(); window.addEventListener("data-changed", h); return () => window.removeEventListener("data-changed", h); }, [load]);
  return { data, error, loading, reload: load };
}

export const inr = (n: number | null | undefined, opts: { compact?: boolean } = {}) => {
  if (n === null || n === undefined || !isFinite(n)) return "-";
  if (opts.compact) { if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`; if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`; if (Math.abs(n) >= 1e3) return `₹${(n / 1e3).toFixed(0)}k`; }
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
};
export const pct = (x: number | null | undefined, d = 0) => (x === null || x === undefined || !isFinite(x) ? "-" : `${(x * 100).toFixed(d)}%`);
export const fmtDate = (s?: string | null) => (s ? new Date(s.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "-");
export const label = (s?: string | null) => (s ? s.replace(/_/g, " ") : "-");

"use client";
import React from "react";

export function Card({ title, subtitle, right, children, className = "" }: { title?: React.ReactNode; subtitle?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || right) && (
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>{title && <h2 className="text-sm font-semibold text-slate-800">{title}</h2>}{subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}</div>
          {right}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Kpi({ label, value, sub, tone = "default", hint }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "default" | "good" | "bad" | "warn"; hint?: string }) {
  const toneCls = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-rose-700" : tone === "warn" ? "text-amber-700" : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" title={hint}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${toneCls}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

const BADGE: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200", red: "bg-rose-50 text-rose-700 ring-rose-200", amber: "bg-amber-50 text-amber-800 ring-amber-200",
  blue: "bg-sky-50 text-sky-700 ring-sky-200", slate: "bg-slate-100 text-slate-700 ring-slate-200", violet: "bg-violet-50 text-violet-700 ring-violet-200",
};
export function Badge({ children, color = "slate" }: { children: React.ReactNode; color?: keyof typeof BADGE | string }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${BADGE[color] || BADGE.slate}`}>{children}</span>;
}
export const stageColor = (s: string) => ({ partner_confirmed: "green", lost: "red", withdrawn: "red", negotiating: "violet", proposal_sent: "blue", contacted: "amber", prospecting: "slate" } as any)[s] || "slate";
export const groupColor = (g: string) => ({ warm: "green", inbound: "blue", cold: "slate" } as any)[g] || "slate";
export const signalColor = (s: string) => ({ Scale: "green", Change: "amber", Stop: "red", "Keep testing": "blue", "No data": "slate" } as any)[s] || "slate";

export function Table({ cols, rows, empty = "No rows", dense = false, rowKey }: { cols: { key: string; label: React.ReactNode; render?: (r: any) => React.ReactNode; align?: "right" | "left"; className?: string }[]; rows: any[]; empty?: string; dense?: boolean; rowKey?: (r: any, i: number) => string }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead><tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
          {cols.map((c) => <th key={c.key} className={`whitespace-nowrap px-2 py-2 font-medium ${c.align === "right" ? "text-right" : ""}`}>{c.label}</th>)}
        </tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={cols.length} className="px-2 py-6 text-center text-slate-400">{empty}</td></tr>}
          {rows.map((r, i) => (
            <tr key={rowKey ? rowKey(r, i) : i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
              {cols.map((c) => <td key={c.key} className={`${dense ? "py-1.5" : "py-2"} px-2 align-top ${c.align === "right" ? "text-right tabular-nums" : ""} ${c.className || ""}`}>{c.render ? c.render(r) : r[c.key] ?? "-"}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Btn({ children, onClick, kind = "primary", small = false, disabled = false, type = "button", title }: { children: React.ReactNode; onClick?: () => void; kind?: "primary" | "ghost" | "danger" | "outline"; small?: boolean; disabled?: boolean; type?: "button" | "submit"; title?: string }) {
  const k = kind === "primary" ? "bg-indigo-600 text-white hover:bg-indigo-700" : kind === "danger" ? "bg-rose-600 text-white hover:bg-rose-700" : kind === "outline" ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50" : "text-slate-600 hover:bg-slate-100";
  return <button type={type} title={title} disabled={disabled} onClick={onClick} className={`${k} ${small ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"} rounded-md font-medium disabled:opacity-50`}>{children}</button>;
}

export const inputCls = "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export function Loading({ what = "data" }: { what?: string }) { return <div className="animate-pulse p-6 text-sm text-slate-400">Loading {what}…</div>; }
export function ErrorBox({ error }: { error: string }) { return <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>; }

export function Progress({ value, goal, tone }: { value: number; goal: number | null | undefined; tone?: string }) {
  if (!goal) return null;
  const p = Math.min(100, (100 * value) / goal);
  return <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100"><div className={`h-1.5 rounded-full ${tone || (value >= goal ? "bg-emerald-500" : "bg-indigo-500")}`} style={{ width: `${p}%` }} /></div>;
}

"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useEffect, useState } from "react";
import { AsOfContext, api } from "@/lib/client";
import Copilot from "./Copilot";

const NAV = [
  { href: "/", label: "Command Center", desc: "Measure" },
  { href: "/diagnose", label: "Diagnose", desc: "Bottlenecks" },
  { href: "/decide", label: "Decide", desc: "Bets & model" },
  { href: "/execute", label: "Execute", desc: "Deals, tasks" },
  { href: "/copilot", label: "AI Copilot", desc: "Full screen" },
  { href: "/data", label: "Data & Audit", desc: "Sources" },
];
const PRESETS: [string, string | null][] = [["Latest", null], ["15 Feb", "2025-02-15"], ["14 Mar (launch plan)", "2025-03-14"], ["15 Mar (revised plan)", "2025-03-15"], ["31 Mar", "2025-03-31"], ["11 Apr (eve of fest)", "2025-04-11"]];

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [asOf, setAsOfState] = useState<string | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { try { const v = localStorage.getItem("asOf"); if (v) setAsOfState(v === "latest" ? null : v); } catch {} api("/api/health").then(setHealth).catch(() => setHealth({ ok: false })); }, []);
  const setAsOf = (d: string | null) => { setAsOfState(d); try { localStorage.setItem("asOf", d || "latest"); } catch {} };
  return (
    <AsOfContext.Provider value={{ asOf, setAsOf }}>
      <div className="flex min-h-screen bg-slate-50 text-slate-800">
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
          <div className="px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-indigo-600">Sponsorship</div>
            <div className="text-base font-bold leading-tight">Growth Center</div>
            <div className="mt-1 text-xs text-slate-500">CampusFest · Delhi NCR</div>
          </div>
          <nav className="flex-1 space-y-0.5 px-2">
            {NAV.map((n) => { const active = n.href === "/" ? path === "/" : path.startsWith(n.href); return (
              <Link key={n.href} href={n.href} className={`block rounded-md px-3 py-2 ${active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}>
                <div className="text-sm font-medium">{n.label}</div><div className="text-[11px] text-slate-400">{n.desc}</div>
              </Link>); })}
          </nav>
          <div className="space-y-1 border-t border-slate-100 p-3 text-[11px] text-slate-500">
            <div>DB: <b>{health?.db || "…"}</b>{health && !health.persistent && <span className="text-rose-600"> (not persistent)</span>}</div>
            <div>AI: <b>{health ? (health.llm ? "configured" : "not configured") : "…"}</b></div>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white/90 px-4 py-2 backdrop-blur">
            <div className="mr-2 text-sm text-slate-500">Snapshot:</div>
            {PRESETS.map(([l, d]) => (
              <button key={l} onClick={() => setAsOf(d)} className={`rounded-full px-2.5 py-1 text-xs ${asOf === d ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{l}</button>
            ))}
            <input type="date" value={asOf || ""} min="2025-01-15" onChange={(e) => setAsOf(e.target.value || null)} className="rounded-md border border-slate-300 px-2 py-0.5 text-xs" title="Any date: end of day IST" />
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden text-xs text-slate-400 lg:inline">{asOf ? `Counting records up to end of ${asOf} IST` : "Counting all records"}</span>
              <button onClick={() => setOpen((v) => !v)} className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">{open ? "Close copilot" : "Ask the AI copilot"}</button>
            </div>
          </header>
          <div className="flex min-h-0 flex-1">
            <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
            {open && path !== "/copilot" && (
              <aside className="sticky top-[49px] h-[calc(100vh-49px)] w-full max-w-md shrink-0 border-l border-slate-200 bg-white"><Copilot compact /></aside>
            )}
          </div>
        </div>
      </div>
    </AsOfContext.Provider>
  );
}

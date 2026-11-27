"use client";
import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, notifyChange, useAsOf } from "@/lib/client";

type Msg = { role: "user" | "assistant"; content: string; trace?: any[]; proposals?: any[]; model?: string | null; asOf?: string | null; offline?: boolean };
const SUGGESTIONS = [
  "Are we on track for the confirmed-partnership target? What's driving the gap?",
  "Which campaigns should we scale, change or stop, and why?",
  "Where is the biggest bottleneck in the funnel?",
  "Which stalled deals should we follow up first? Create tasks for the top 3.",
  "How much cash have we actually collected?",
  "What happens to stretch cash if renewals come in at 50%?",
];

export default function Copilot({ compact = false }: { compact?: boolean }) {
  const { asOf } = useAsOf();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => { try { const s = localStorage.getItem("copilot-thread"); if (s) setMsgs(JSON.parse(s)); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem("copilot-thread", JSON.stringify(msgs.slice(-30))); } catch {} const el = boxRef.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs, busy]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: text.trim() }];
    setMsgs(next); setInput(""); setBusy(true);
    try {
      const r: any = await api("/api/copilot", { method: "POST", body: { messages: next.map((m) => ({ role: m.role, content: m.content })), asOf } });
      setMsgs([...next, { role: "assistant", content: r.reply, trace: r.trace, proposals: r.proposals, model: r.model, asOf: r.as_of, offline: r.offline }]);
    } catch (e: any) { setMsgs([...next, { role: "assistant", content: `Request failed: ${e.message}` }]); }
    finally { setBusy(false); }
  }

  async function decide(mi: number, pi: number, decision: "confirm" | "reject") {
    const p = msgs[mi].proposals![pi];
    try {
      const r: any = await api(`/api/actions/${p.action_id}`, { method: "POST", body: { decision } });
      const copy = [...msgs]; copy[mi] = { ...copy[mi], proposals: copy[mi].proposals!.map((x, j) => (j === pi ? { ...x, status: r.status, result: r.result } : x)) }; setMsgs(copy);
      if (decision === "confirm") notifyChange();
    } catch (e: any) { alert(e.message); }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
        <div><div className="text-sm font-semibold">AI Growth Analyst</div><div className="text-[11px] text-slate-500">Answers from live app data · {asOf ? `as of ${asOf}` : "latest data"}</div></div>
        {msgs.length > 0 && <button className="text-xs text-slate-500 hover:text-slate-800" onClick={() => setMsgs([])}>New chat</button>}
      </div>
      <div ref={boxRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {msgs.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-slate-600">I query the campaign database through tools (funnel, campaigns, deals, bets, SQL), show the data I used, say when the data can't answer, and propose tasks you confirm.</p>
            {SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)} className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 hover:border-indigo-300 hover:bg-indigo-50">{s}</button>)}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            {m.role === "user" ? <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-600 px-3 py-2 text-sm text-white">{m.content}</div> : (
              <div className="space-y-2">
                <div className={`prose-sm max-w-none rounded-2xl rounded-bl-sm border px-3 py-2 text-sm ${m.offline ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"} md-body`}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
                {!!m.proposals?.length && (
                  <div className="space-y-1.5">
                    {m.proposals.map((p, j) => (
                      <div key={p.action_id} className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-2 text-xs">
                        <div className="font-medium text-indigo-900">Proposed: {p.summary}</div>
                        <div className="mt-0.5 text-[11px] text-indigo-800/80">{p.action_type} · {Object.entries(p.payload || {}).map(([k, v]) => `${k}: ${v}`).join(" · ")}</div>
                        {p.status === "pending" ? (
                          <div className="mt-1.5 flex gap-2"><button onClick={() => decide(i, j, "confirm")} className="rounded bg-indigo-600 px-2 py-0.5 text-white">Confirm</button><button onClick={() => decide(i, j, "reject")} className="rounded border border-slate-300 bg-white px-2 py-0.5">Reject</button></div>
                        ) : <div className={`mt-1 font-medium ${p.status === "confirmed" ? "text-emerald-700" : "text-slate-500"}`}>{p.status === "confirmed" ? "✓ Confirmed and saved" : "Rejected"}</div>}
                      </div>
                    ))}
                  </div>
                )}
                {!!m.trace?.length && (
                  <details className="text-[11px] text-slate-500">
                    <summary className="cursor-pointer select-none">Data used ({m.trace.length} tool call{m.trace.length > 1 ? "s" : ""}{m.model ? ` · ${m.model}` : ""})</summary>
                    <ul className="mt-1 space-y-1">{m.trace.map((t, k) => <li key={k} className="rounded bg-slate-50 px-2 py-1 font-mono"><b>{t.tool}</b>({JSON.stringify(t.args)}) → {t.summary} <span className="text-slate-400">{t.ms}ms</span></li>)}</ul>
                  </details>
                )}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="animate-pulse text-sm text-slate-400">Analysing - querying the data…</div>}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="border-t border-slate-100 p-3">
        <div className="flex gap-2">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} rows={compact ? 2 : 3} placeholder="Ask about performance, bottlenecks, what to scale or stop…" className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
          <button disabled={busy} className="self-end rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Send</button>
        </div>
      </form>
    </div>
  );
}

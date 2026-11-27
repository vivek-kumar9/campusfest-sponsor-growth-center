"use client";
import { useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";
import { useApi, inr, pct, mutate } from "@/lib/client";
import { Card, Badge, Table, Loading, ErrorBox, Btn, inputCls, signalColor } from "@/components/ui";

const fmtKpi = (k: string, v: number | null) => v === null ? "-" : k.includes("per_week") ? `${v}/wk` : pct(v);

export default function Decide() {
  const ini = useApi<any>("/api/initiatives");
  const model = useApi<any>("/api/model", false);
  const team = useApi<any[]>("/api/team", false);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  if (ini.error) return <ErrorBox error={ini.error} />;
  if (!ini.data || !model.data) return <Loading what="bets and model" />;
  const inits = ini.data.initiatives;
  const totalBudget = inits.reduce((a: number, x: any) => a + (x.budget_inr || 0), 0);
  const totalSpent = inits.reduce((a: number, x: any) => a + (x.spent_inr || 0), 0);
  const effort = inits.reduce((a: number, x: any) => a + (x.effort_weeks || 0), 0);
  const cap = model.data.budgetCap;
  const capWeeks = model.data.assumptions.find((a: any) => a.key === "team_capacity_weeks")?.value;
  const m = model.data;
  const saveAssumptions = async () => {
    setSaving(true);
    try { for (const [k, v] of Object.entries(edit)) await mutate(`/api/assumptions/${k}`, "PATCH", { value: Number(v) }); setEdit({}); } catch (e: any) { alert(e.message); } finally { setSaving(false); }
  };
  const chart = m.segments.map((s: any) => ({ name: s.segment.split(" (")[0], Base: s.base.collected, Stretch: s.stretch.collected }));
  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-bold">Decide</h1><p className="text-sm text-slate-500">Where to place bets: ranked initiatives with live KPI signals, and the next-edition cash model</p></div>

      <Card title="Five bets, ranked" subtitle={<>Score = expected incremental cash collected (₹ lakh) × confidence ÷ effort (person-weeks). Signal compares the live KPI with each bet's scale/stop thresholds ({ini.data.ctx.label}).</>}
        right={<div className="text-right text-xs text-slate-500">Budget {inr(totalBudget, { compact: true })} of {inr(cap, { compact: true })} cap · spent {inr(totalSpent, { compact: true })}<br />Effort {effort} of {capWeeks} person-weeks</div>}>
        <Table rows={inits} cols={[
          { key: "rank", label: "#", render: (x) => <b>{x.rank}</b> },
          { key: "name", label: "Bet", render: (x) => <div className="min-w-[300px] max-w-md"><div className="font-medium">{x.name}</div><div className="line-clamp-2 text-[11px] text-slate-500" title={x.concept}>{x.concept}</div></div> },
          { key: "owner", label: "Owner", render: (x) => <select className={inputCls + " text-xs"} value={x.owner_id || ""} onChange={(e) => mutate(`/api/initiatives/${x.initiative_id}`, "PATCH", { owner: e.target.value })}>{(team.data || []).map((t: any) => <option key={t.owner_id} value={t.owner_id}>{t.owner_name}</option>)}</select> },
          { key: "exp", label: "Expected +cash", align: "right", render: (x) => inr(x.expected_incremental_inr, { compact: true }) },
          { key: "confidence", label: "Conf.", align: "right", render: (x) => pct(x.confidence) },
          { key: "effort_weeks", label: "Effort (pw)", align: "right" },
          { key: "score", label: "Score", align: "right", render: (x) => <b>{x.score}</b> },
          { key: "budget", label: "Budget / spent", align: "right", render: (x) => <div className="flex flex-col items-end gap-1"><span>{inr(x.budget_inr, { compact: true })}</span>
            <input className={inputCls + " w-20 text-right text-xs"} defaultValue={x.spent_inr || 0} onBlur={(e) => Number(e.target.value) !== (x.spent_inr || 0) && mutate(`/api/initiatives/${x.initiative_id}`, "PATCH", { spent_inr: Number(e.target.value) })} title="Spent so far (edit)" /></div> },
          { key: "kpi", label: "Live KPI vs thresholds", render: (x) => <div className="min-w-[220px] max-w-[260px] text-xs"><div className="text-slate-500">{x.kpi_label}</div><div><b>{fmtKpi(x.kpi_key, x.kpi_value)}</b> <span className="text-slate-400">scale ≥ {fmtKpi(x.kpi_key, x.scale_threshold)} · stop &lt; {fmtKpi(x.kpi_key, x.stop_threshold)}</span></div><div className="line-clamp-2 text-[11px] text-slate-400" title={x.kpi_note}>{x.kpi_note}</div></div> },
          { key: "signal", label: "Signal", render: (x) => <Badge color={signalColor(x.signal)}>{x.signal}</Badge> },
          { key: "decision", label: "Decision", render: (x) => <select className={inputCls + " text-xs"} value={x.decision || ""} onChange={(e) => mutate(`/api/initiatives/${x.initiative_id}`, "PATCH", { decision: e.target.value })}>
            {["Run as planned", "Double down", "Scale", "Change approach", "Pause", "Stop"].map((d) => <option key={d}>{d}</option>)}</select> },
          { key: "tasks", label: "Tasks", align: "right", render: (x) => `${x.open_tasks} open` },
        ]} />
        <div className="mt-3 grid gap-2 text-xs text-slate-600 md:grid-cols-3">
          <div className="rounded-lg bg-emerald-50 p-2"><b>Double down:</b> #1 payment terms (cheapest cash), #3 warm-intro engine (largest ₹), #2 renewals (fastest).</div>
          <div className="rounded-lg bg-amber-50 p-2"><b>Test with a cap:</b> #4 inbound (₹15k ad-spend gate before scaling).</div>
          <div className="rounded-lg bg-rose-50 p-2"><b>Deprioritised / rejected:</b> mass cold email (0 of 33 cold deals confirmed, 7 opt-outs), across-the-board price rise, barter deals (not cash), agency outsourcing.</div>
        </div>
      </Card>

      <div className="grid gap-4">
        <Card title="Next-edition cash model: base vs stretch" subtitle={m.note}>
          <Table dense rows={m.segments} cols={[
            { key: "segment", label: "Segment", render: (s) => <span className="whitespace-nowrap font-medium">{s.segment}</span> },
            { key: "b", label: "Base: prospects × conv → deals", align: "right", render: (s) => `${s.base.prospects} × ${pct(s.base.conv)} → ${s.base.deals}` },
            { key: "bs", label: "Base signed → collected", align: "right", render: (s) => `${inr(s.base.signed, { compact: true })} × ${pct(s.base.collection_rate)} = ${inr(s.base.collected, { compact: true })}` },
            { key: "s", label: "Stretch: prospects × conv → deals", align: "right", render: (s) => `${s.stretch.prospects} × ${pct(s.stretch.conv)} → ${s.stretch.deals}` },
            { key: "ss", label: "Stretch signed → collected", align: "right", render: (s) => `${inr(s.stretch.signed, { compact: true })} × ${pct(s.stretch.collection_rate)} = ${inr(s.stretch.collected, { compact: true })}` },
          ]} />
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-slate-200 p-3"><div className="text-xs uppercase text-slate-500">Base case</div><div className="text-lg font-semibold">{inr(m.base.collected, { compact: true })} collected</div><div className="text-xs text-slate-500">{m.base.deals} deals · {inr(m.base.signed, { compact: true })} signed</div></div>
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3"><div className="text-xs uppercase text-indigo-600">Stretch target</div><div className="text-lg font-semibold text-indigo-900">{inr(m.stretch.collected, { compact: true })} collected</div><div className="text-xs text-indigo-700">{m.stretch.deals} deals · {inr(m.stretch.signed, { compact: true })} signed</div></div>
          </div>
          <div className="mt-3 h-48"><ResponsiveContainer><BarChart data={chart}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" /><XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} tickFormatter={(v) => `${(v / 1e5).toFixed(0)}L`} /><Tooltip formatter={(v: any) => inr(v)} /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="Base" fill="#94a3b8" /><Bar dataKey="Stretch" fill="#4f46e5" /></BarChart></ResponsiveContainer></div>
        </Card>
        <Card title="Assumptions (editable)" subtitle="Tagged by source. Edit and save to re-run the model; the copilot uses the same table." right={Object.keys(edit).length ? <Btn small onClick={saveAssumptions} disabled={saving}>{saving ? "Saving…" : `Save ${Object.keys(edit).length}`}</Btn> : null}>
          <div className="grid gap-x-6 lg:grid-cols-2">{[m.assumptions.slice(0, Math.ceil(m.assumptions.length / 2)), m.assumptions.slice(Math.ceil(m.assumptions.length / 2))].map((part: any[], pi: number) => (
            <Table key={pi} dense rows={part} cols={[
              { key: "label", label: "Assumption", render: (a) => <div><div>{a.label}</div>{a.note && <div className="text-[11px] text-slate-400">{a.note}</div>}</div> },
              { key: "source_tag", label: "Source", render: (a) => <Badge color={a.source_tag === "dataset" ? "green" : a.source_tag.includes("benchmark") ? "blue" : "amber"}>{a.source_tag}</Badge> },
              { key: "value", label: "Value", align: "right", render: (a) => <input className={inputCls + " w-24 text-right text-xs"} value={edit[a.key] ?? String(a.value)} onChange={(e) => setEdit({ ...edit, [a.key]: e.target.value })} /> },
            ]} />))}
          </div>
        </Card>
      </div>
    </div>
  );
}

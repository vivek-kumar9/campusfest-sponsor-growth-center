"use client";
import { useState } from "react";
import { useApi, inr, pct, label, mutate, fmtDate } from "@/lib/client";
import { Card, Badge, Table, Loading, ErrorBox, Btn, stageColor, groupColor } from "@/components/ui";

const SEV: Record<string, string> = { high: "border-rose-200 bg-rose-50", medium: "border-amber-200 bg-amber-50", low: "border-slate-200 bg-white", info: "border-emerald-200 bg-emerald-50" };

export default function Diagnose() {
  const [minDays, setMinDays] = useState(10);
  const d = useApi<any>(`/api/diagnose?minDays=${minDays}`);
  const fg = useApi<any>("/api/funnel?groupBy=channel_group");
  const fc = useApi<any>("/api/funnel?groupBy=campaign");
  const ov = useApi<any>("/api/overview");
  const [made, setMade] = useState<Record<string, boolean>>({});
  const [showAll, setShowAll] = useState(false);
  if (d.error) return <ErrorBox error={d.error} />;
  if (!d.data) return <Loading what="diagnostics" />;
  const findings = d.data.findings.filter((f: any) => f.type !== "channel_summary");
  const summaries = d.data.findings.filter((f: any) => f.type === "channel_summary");
  const stepsOrder = ["touched", "responded", "positive_reply", "meeting_held", "qualified", "opportunity", "proposal_sent", "confirmed"];
  const followUp = async (o: any) => {
    const due = new Date(Date.now() + 5.5 * 3600e3 + 2 * 864e5).toISOString().slice(0, 10);
    await mutate("/api/tasks", "POST", { title: `Follow up ${o.brand_name} - ${label(o.stage)} for ${o.days_in_stage} days`, owner: o.owner_id, due_date: due, priority: (o.proposed_value_inr || 0) >= 90000 ? "high" : "medium", related_type: "opportunity", related_id: o.opportunity_id });
    setMade({ ...made, [o.opportunity_id]: true });
  };
  const heat = (v: number | null) => v === null ? "" : v >= 0.8 ? "bg-emerald-100" : v >= 0.5 ? "bg-emerald-50" : v >= 0.25 ? "bg-amber-50" : "bg-rose-100";
  const wm = ov.data?.forecast?.winModel;
  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-bold">Diagnose</h1><p className="text-sm text-slate-500">What is working, where deals stall and why - {d.data.ctx.label}</p></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {findings.map((f: any, i: number) => (
          <div key={i} className={`rounded-xl border p-3 ${SEV[f.severity] || SEV.low}`}>
            <div className="flex items-center gap-2"><Badge color={f.severity === "high" ? "red" : f.severity === "medium" ? "amber" : f.severity === "info" ? "green" : "slate"}>{f.type.replace("_", " ")}</Badge><div className="text-sm font-semibold">{f.title}</div></div>
            <p className="mt-1.5 text-xs text-slate-700">{f.evidence}</p>
            {f.implication && <p className="mt-1 text-xs italic text-slate-500">{f.implication}</p>}
          </div>
        ))}
      </div>

      <Card title="Funnel conversion by channel group" subtitle="Cells show distinct brands and conversion from the previous step (green = strong, red = leak)">
        <div className="overflow-x-auto"><table className="min-w-full text-xs">
          <thead><tr className="text-left text-slate-500"><th className="p-2">Group</th>{stepsOrder.map((s) => <th key={s} className="p-2 capitalize">{label(s)}</th>)}<th className="p-2">Touched → confirmed</th></tr></thead>
          <tbody>{(fg.data?.groups || []).map((g: any) => (
            <tr key={g.group} className="border-t border-slate-100"><td className="p-2"><Badge color={groupColor(g.group)}>{g.group}</Badge></td>
              {g.steps.map((s: any) => <td key={s.step} className={`p-2 tabular-nums ${heat(s.conv_from_prev)}`}><b>{s.brands}</b>{s.conv_from_prev !== null && <span className="ml-1 text-slate-500">{pct(s.conv_from_prev)}</span>}</td>)}
              <td className="p-2 font-semibold">{pct(g.touched_to_confirmed)}</td></tr>))}</tbody>
        </table></div>
        <p className="mt-2 text-[11px] text-slate-500">A step above 100% means more brands reached that step than the previous one, e.g. opportunities opened for brands that were never qualified.</p>
        <div className="mt-3 grid gap-2 md:grid-cols-3">{summaries.map((s: any) => (
          <div key={s.group} className="rounded-lg bg-slate-50 p-2 text-xs"><Badge color={groupColor(s.group)}>{s.group}</Badge> <span className="text-slate-600">{s.touches} touches → {s.opportunities} opps → <b>{s.confirmed} confirmed</b> ({inr(s.confirmed_value, { compact: true })}); win rate on resolved {pct(s.win_rate_resolved)}; open {s.open_opps} ({inr(s.open_value, { compact: true })})</span></div>))}</div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title={`Stalled open deals (≥ ${minDays} days without a stage change)`} subtitle="Sorted by proposed value. Create a follow-up task straight from here."
          right={<select value={minDays} onChange={(e) => setMinDays(Number(e.target.value))} className="rounded border border-slate-300 px-1 py-0.5 text-xs">{[5, 10, 14, 21, 30].map((n) => <option key={n} value={n}>≥ {n} days</option>)}</select>}>
          <Table dense rows={showAll ? d.data.stalled : d.data.stalled.slice(0, 10)} empty="No stalled deals at this snapshot" cols={[
            { key: "brand_name", label: "Brand", render: (o) => <div className="whitespace-nowrap"><div className="font-medium">{o.brand_name}</div><div className="text-[11px] text-slate-400">{o.opportunity_id} · {o.campaign_name}</div></div> },
            { key: "group", label: "Group", render: (o) => <Badge color={groupColor(o.channel_group)}>{o.channel_group}</Badge> },
            { key: "stage", label: "Stage", render: (o) => <Badge color={stageColor(o.stage)}>{label(o.stage)}</Badge> },
            { key: "days_in_stage", label: "Days in stage", align: "right" },
            { key: "days_since_touch", label: "Days since touch", align: "right" },
            { key: "proposed_value_inr", label: "Value", align: "right", render: (o) => inr(o.proposed_value_inr) },
            { key: "owner_name", label: "Owner", className: "whitespace-nowrap" },
            { key: "act", label: "", className: "whitespace-nowrap", render: (o) => made[o.opportunity_id] ? <span className="text-xs text-emerald-700">Task created</span> : <Btn small kind="outline" onClick={() => followUp(o)}>+ Task</Btn> },
          ]} />
          {d.data.stalled.length > 10 && <button onClick={() => setShowAll(!showAll)} className="mt-2 text-xs text-indigo-600 hover:underline">{showAll ? "Show top 10" : `Show all ${d.data.stalled.length}`}</button>}
        </Card>
        <Card title="Win probability model" subtitle="Deals resolved by this snapshot that reached each stage (wins/total → Laplace-smoothed p). Used for the projection.">
          {wm ? <Table dense rows={["warm", "inbound", "cold", "all"].map((g) => ({ g, ...wm[g] }))} cols={[
            { key: "g", label: "Group", render: (r) => <Badge color={groupColor(r.g)}>{r.g}</Badge> },
            ...["proposal_sent", "negotiating"].map((st) => ({ key: st, label: label(st), align: "right" as const, className: "whitespace-nowrap", render: (r: any) => <span title={`${r[st].wins} won of ${r[st].n} resolved`}>{r[st].wins}/{r[st].n} → {(r[st].p * 100).toFixed(0)}%</span> })),
          ]} /> : <Loading />}
          <p className="mt-2 text-[11px] text-slate-500">Median proposal→confirmation: {ov.data?.forecast?.medianProposalToConfirmDays} days. Small samples are shown with their counts.</p>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3" title="Team workload and results" subtitle="Brand ownership vs deal ownership">
          <Table dense rows={d.data.owners} cols={[
            { key: "owner_name", label: "Owner" }, { key: "brands_owned", label: "Brands", align: "right" }, { key: "interactions_logged", label: "Interactions", align: "right" },
            { key: "opportunities", label: "Opps", align: "right" }, { key: "confirmed", label: "Confirmed", align: "right" }, { key: "confirmed_value", label: "Value", align: "right", render: (o) => inr(o.confirmed_value, { compact: true }) },
            { key: "stalled_opps", label: "Stalled", align: "right" }, { key: "open_tasks", label: "Open tasks", align: "right" }, { key: "overdue_tasks", label: "Overdue", align: "right", render: (o) => o.overdue_tasks ? <span className="font-semibold text-rose-600">{o.overdue_tasks}</span> : 0 },
          ]} />
        </Card>
        <Card className="xl:col-span-2" title="Funnel by campaign" subtitle="Distinct brands per step">
          <Table dense rows={fc.data?.groups || []} cols={[
            { key: "group", label: "Campaign", render: (g) => <span className="font-medium">{g.group}</span> },
            ...["touched", "meeting_held", "qualified", "opportunity", "confirmed"].map((st) => ({ key: st, label: label(st), align: "right" as const, render: (g: any) => g.steps.find((x: any) => x.step === st)?.brands ?? 0 })),
            { key: "t", label: "Touched→conf.", align: "right", render: (g) => pct(g.touched_to_confirmed) },
          ]} />
        </Card>
      </div>
    </div>
  );
}

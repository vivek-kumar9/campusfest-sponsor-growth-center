"use client";
import Link from "next/link";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine } from "recharts";
import { useApi, inr, pct, fmtDate, label } from "@/lib/client";
import { Card, Kpi, Badge, Table, Loading, ErrorBox, Progress, groupColor } from "@/components/ui";

export default function CommandCenter() {
  const ov = useApi<any>("/api/overview");
  const tr = useApi<any>("/api/trend");
  const fu = useApi<any>("/api/funnel?groupBy=none");
  const fg = useApi<any>("/api/funnel?groupBy=channel_group");
  const cp = useApi<any[]>("/api/campaigns");
  if (ov.error) return <ErrorBox error={ov.error} />;
  if (!ov.data) return <Loading what="command center" />;
  const o = ov.data; const t = o.target || {};
  const confGoal = t.confirmed_partnerships_goal, qualGoal = t.qualified_brands_goal;
  const fc = o.forecast;
  const steps = fu.data?.groups?.[0]?.steps || [];
  const maxB = Math.max(1, ...steps.map((s: any) => s.brands));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Command Center</h1>
          <p className="text-sm text-slate-500">{o.event.event_name} · event {fmtDate(o.event.event_starts_at)} · {o.ctx.label} · target: <b>{t.target_version || "none"}</b>{t.effective_at ? ` (from ${fmtDate(t.effective_at)})` : ""}</p>
        </div>
        <div className="text-right text-sm">{o.eventPassed ? <Badge color="slate">Event has passed in this snapshot - showing final results</Badge> : <Badge color={o.daysToEvent < 21 ? "amber" : "blue"}>{o.daysToEvent} days to event</Badge>}</div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <div className="col-span-1"><Kpi label="Confirmed partnerships" value={<>{o.confirmedCount}<span className="text-base font-normal text-slate-400"> / {confGoal ?? "-"}</span></>} tone={confGoal && o.confirmedCount >= confGoal ? "good" : "warn"} sub={<>{confGoal ? `${pct(o.confirmedCount / confGoal)} of goal` : ""}<Progress value={o.confirmedCount} goal={confGoal} /></>} /></div>
        <div className="col-span-1"><Kpi label="Qualified brands" value={<>{o.qualified}<span className="text-base font-normal text-slate-400"> / {qualGoal ?? "-"}</span></>} tone={qualGoal && o.qualified >= qualGoal ? "good" : "warn"} sub={<>{qualGoal ? `${pct(o.qualified / qualGoal)} of goal` : ""}<Progress value={o.qualified} goal={qualGoal} /></>} /></div>
        <Kpi label="Confirmed value" value={inr(o.confirmedValue, { compact: true })} sub={`cash ${inr(o.cashConfirmedValue, { compact: true })} · in-kind ${inr(o.inKindConfirmedValue, { compact: true })}`} hint="Reported partnership value - not proof of bank receipt" />
        <Kpi label="Cash received" value={inr(o.cashReceived, { compact: true })} tone={o.cashReceived ? "default" : "bad"} sub={o.paymentsCount ? `${o.paymentsCount} payments · ${pct(o.cashReceived / Math.max(1, o.cashConfirmedValue))} of confirmed cash` : <span>No receipts recorded. <Link className="text-indigo-600 underline" href="/execute?tab=payments">Record payments</Link></span>} />
        <Kpi label="Open pipeline" value={inr(o.openValue, { compact: true })} sub={`${o.openCount} open deals · ${o.lostCount} lost · ${o.withdrawnCount} withdrawn`} />
        <Kpi label={o.eventPassed ? "Final at event" : "Projected at event"} value={<>{fc.projectedConfirmedCount}<span className="text-base font-normal text-slate-400"> deals</span></>} tone={confGoal && fc.projectedConfirmedCount >= confGoal ? "good" : "bad"} sub={`${inr(fc.projectedConfirmedValue, { compact: true })} · +${fc.expectedAdditionalDeals} expected from open`} hint={fc.method} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Confirmed partnerships vs target" subtitle="Cumulative, latest stage per opportunity each day (withdrawn deals drop out)">
          <div className="h-56">{tr.data && <ResponsiveContainer><LineChart data={tr.data.series}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" /><XAxis dataKey="day" tickFormatter={(d) => d.slice(5)} fontSize={11} /><YAxis fontSize={11} allowDecimals={false} /><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="stepAfter" dataKey="confirmed_goal" name="Goal" stroke="#f59e0b" strokeDasharray="4 3" dot={false} />
            <Line type="monotone" dataKey="confirmed" name="Confirmed" stroke="#4f46e5" strokeWidth={2} dot={false} />
            <ReferenceLine x={tr.data.eventStart} stroke="#e11d48" label={{ value: "Fest", fontSize: 10, fill: "#e11d48" }} /></LineChart></ResponsiveContainer>}</div>
        </Card>
        <Card title="Qualified brands vs target" subtitle="Latest qualification version per brand each day">
          <div className="h-56">{tr.data && <ResponsiveContainer><LineChart data={tr.data.series}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" /><XAxis dataKey="day" tickFormatter={(d) => d.slice(5)} fontSize={11} /><YAxis fontSize={11} allowDecimals={false} /><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="stepAfter" dataKey="qualified_goal" name="Goal" stroke="#f59e0b" strokeDasharray="4 3" dot={false} />
            <Line type="monotone" dataKey="qualified" name="Qualified" stroke="#059669" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer>}</div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card title="Sponsor funnel (distinct brands)" subtitle="Step conversion from the previous stage" className="lg:col-span-2">
          <div className="space-y-1.5">
            {steps.map((s: any) => (
              <div key={s.step} className="text-xs">
                <div className="flex justify-between"><span className="capitalize text-slate-600">{label(s.step)}</span><span className="tabular-nums text-slate-500">{s.brands}{s.conv_from_prev !== null && <span className="ml-2 text-slate-400">{pct(s.conv_from_prev)}</span>}</span></div>
                <div className="h-3 rounded bg-slate-100"><div className="h-3 rounded bg-indigo-500" style={{ width: `${(100 * s.brands) / maxB}%` }} /></div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Channel groups" subtitle="Warm intros vs inbound vs cold outreach" className="lg:col-span-3">
          <Table dense cols={[
            { key: "group", label: "Group", render: (g) => <Badge color={groupColor(g.group)}>{g.group}</Badge> },
            ...["touched", "meeting_held", "qualified", "opportunity", "confirmed"].map((st) => ({ key: st, label: label(st), align: "right" as const, render: (g: any) => g.steps.find((x: any) => x.step === st)?.brands ?? 0 })),
            { key: "ttc", label: "Touched→confirmed", align: "right", render: (g) => <b>{pct(g.touched_to_confirmed)}</b> },
          ]} rows={(fg.data?.groups || []).sort((a: any, b: any) => (b.touched_to_confirmed || 0) - (a.touched_to_confirmed || 0))} />
          <p className="mt-2 text-xs text-slate-500">Attribution is observational: each record keeps the campaign it was logged under.</p>
        </Card>
      </div>

      <Card title="Campaign performance" subtitle="Rates use root touches (first outreach, introduction or inbound form) as the denominator" right={<Link href="/execute?tab=campaigns" className="text-xs text-indigo-600 hover:underline">Manage campaigns →</Link>}>
        {cp.data ? <Table dense cols={[
          { key: "campaign_name", label: "Campaign", render: (c) => <div><div className="font-medium">{c.campaign_name}</div><div className="text-[11px] text-slate-400">{c.owner_name} · {c.channel}</div></div> },
          { key: "channel_group", label: "Group", render: (c) => <Badge color={groupColor(c.channel_group)}>{c.channel_group}</Badge> },
          { key: "status", label: "Status", render: (c) => <Badge color={c.status === "active" ? "green" : c.status === "stopped" ? "red" : "amber"}>{c.status}</Badge> },
          { key: "touches", label: "Touches", align: "right" },
          { key: "reply_rate", label: "Reply", align: "right", render: (c) => pct(c.reply_rate) },
          { key: "meeting_rate", label: "Meeting", align: "right", render: (c) => pct(c.meeting_rate) },
          { key: "qualified_brands", label: "Qualified", align: "right" },
          { key: "opportunities", label: "Opps", align: "right" },
          { key: "confirmed", label: "Confirmed", align: "right", render: (c) => <b>{c.confirmed}</b> },
          { key: "win_rate_resolved", label: "Win (resolved)", align: "right", render: (c) => pct(c.win_rate_resolved) },
          { key: "confirmed_value", label: "Value", align: "right", render: (c) => inr(c.confirmed_value, { compact: true }) },
          { key: "open_value", label: "Open pipeline", align: "right", render: (c) => c.open_opps ? `${c.open_opps} · ${inr(c.open_value, { compact: true })}` : "-" },
          { key: "opt_outs", label: "Opt-outs", align: "right" },
          { key: "budget", label: "Budget / spent", align: "right", render: (c) => c.budget_inr || c.spent_inr ? `${inr(c.budget_inr, { compact: true })} / ${inr(c.spent_inr, { compact: true })}` : <span className="text-slate-300">no data</span> },
        ]} rows={cp.data} /> : <Loading />}
      </Card>
    </div>
  );
}

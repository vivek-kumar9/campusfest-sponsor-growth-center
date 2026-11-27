"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useApi, inr, pct, label, mutate, fmtDate, api, useAsOf } from "@/lib/client";
import { Card, Badge, Table, Loading, ErrorBox, Btn, inputCls, stageColor, groupColor } from "@/components/ui";

const TABS = ["opportunities", "tasks", "campaigns", "brands", "payments", "targets"] as const;
const STAGES = ["prospecting", "contacted", "proposal_sent", "negotiating", "partner_confirmed", "lost", "withdrawn"];
const istToday = (d = 0) => new Date(Date.now() + 5.5 * 3600e3 + d * 864e5).toISOString().slice(0, 10);

function useTeam() { return useApi<any[]>("/api/team", false).data || []; }
function Field({ label: l, children }: { label: string; children: React.ReactNode }) { return <label className="flex flex-col gap-1 text-xs text-slate-600">{l}{children}</label>; }
function Msg({ m }: { m: { ok?: string; err?: string } }) { return m.err ? <div className="text-xs text-rose-600">{m.err}</div> : m.ok ? <div className="text-xs text-emerald-700">{m.ok}</div> : null; }

export default function Execute() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("opportunities");
  useEffect(() => { const t = new URLSearchParams(window.location.search).get("tab") as any; if (TABS.includes(t)) setTab(t); }, []);
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold">Execute</h1><p className="text-sm text-slate-500">Manage deals, tasks, campaigns and payments. Every change is saved and updates the analytics and the copilot immediately.</p></div>
      <div className="flex flex-wrap gap-1 border-b border-slate-200">{TABS.map((t) => <button key={t} onClick={() => { setTab(t); history.replaceState(null, "", `?tab=${t}`); }} className={`-mb-px border-b-2 px-3 py-2 text-sm capitalize ${tab === t ? "border-indigo-600 font-medium text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{t}</button>)}</div>
      {tab === "opportunities" && <Opportunities />}
      {tab === "tasks" && <Tasks />}
      {tab === "campaigns" && <Campaigns />}
      {tab === "brands" && <Brands />}
      {tab === "payments" && <Payments />}
      {tab === "targets" && <Targets />}
    </div>
  );
}

function Opportunities() {
  const { asOf } = useAsOf();
  const opps = useApi<any[]>("/api/opportunities");
  const team = useTeam();
  const [f, setF] = useState({ stage: "", group: "", owner: "", q: "", open: false });
  const [sel, setSel] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [msg, setMsg] = useState<any>({});
  const [detail, setDetail] = useState<any>(null);
  const [newOpp, setNewOpp] = useState<any>(null);
  const rows = useMemo(() => (opps.data || []).filter((o) => (!f.stage || o.stage === f.stage) && (!f.group || o.channel_group === f.group) && (!f.owner || o.owner_id === f.owner) && (!f.open || o.is_open) && (!f.q || `${o.brand_name} ${o.opportunity_name} ${o.opportunity_id}`.toLowerCase().includes(f.q.toLowerCase()))), [opps.data, f]);
  const open = async (o: any) => { setSel(o); setForm({ stage: o.stage, proposed_value_inr: o.proposed_value_inr, note: "", effective_at: "" }); setMsg({}); setDetail(await api(`/api/opportunities/${o.opportunity_id}`)); };
  const save = async () => {
    try { const r: any = await mutate(`/api/opportunities/${sel.opportunity_id}/stage`, "POST", { ...form, asOf }); setMsg({ ok: `Saved: ${label(r.from)} → ${label(r.to)} (effective ${r.effective_at})` }); setDetail(await api(`/api/opportunities/${sel.opportunity_id}`)); }
    catch (e: any) { setMsg({ err: e.message }); }
  };
  const pay = async () => {
    try { const r: any = await mutate(`/api/payments`, "POST", { opportunity_id: sel.opportunity_id, amount_inr: form.pay_amount, received_at: form.pay_date || undefined, asOf }); setMsg({ ok: `Payment ${inr(r.amount_inr)} recorded${r.warning ? ` - note: ${r.warning}` : ""}` }); setDetail(await api(`/api/opportunities/${sel.opportunity_id}`)); }
    catch (e: any) { setMsg({ err: e.message }); }
  };
  if (opps.error) return <ErrorBox error={opps.error} />;
  if (!opps.data) return <Loading />;
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2" title={`Opportunities (${rows.length})`} subtitle="Latest stage per opportunity at the selected snapshot. Click a row to update it." right={<Btn small onClick={() => setNewOpp({ brand: "", proposed_value_inr: 50000, support_type: "cash", deal_type: "new", campaign: "" })}>+ New opportunity</Btn>}>
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          <input placeholder="Search brand / id" className={inputCls} value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          <select className={inputCls} value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })}><option value="">All stages</option>{STAGES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
          <select className={inputCls} value={f.group} onChange={(e) => setF({ ...f, group: e.target.value })}><option value="">All groups</option>{["warm", "inbound", "cold"].map((s) => <option key={s}>{s}</option>)}</select>
          <select className={inputCls} value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })}><option value="">All owners</option>{team.map((t) => <option key={t.owner_id} value={t.owner_id}>{t.owner_name}</option>)}</select>
          <label className="flex items-center gap-1"><input type="checkbox" checked={f.open} onChange={(e) => setF({ ...f, open: e.target.checked })} /> open only</label>
        </div>
        <div className="max-h-[640px] overflow-y-auto">
          <Table dense rows={rows} rowKey={(o) => o.opportunity_id} cols={[
            { key: "brand", label: "Opportunity", render: (o) => <button onClick={() => open(o)} className="text-left"><div className={`font-medium ${sel?.opportunity_id === o.opportunity_id ? "text-indigo-700" : ""}`}>{o.brand_name}</div><div className="text-[11px] text-slate-400">{o.opportunity_id} · {o.support_type}{o.deal_type === "renewal" ? " · renewal" : ""}</div></button> },
            { key: "stage", label: "Stage", render: (o) => <Badge color={stageColor(o.stage)}>{label(o.stage)}</Badge> },
            { key: "channel_group", label: "Group", render: (o) => <Badge color={groupColor(o.channel_group)}>{o.channel_group || "-"}</Badge> },
            { key: "proposed_value_inr", label: "Proposed", align: "right", render: (o) => inr(o.proposed_value_inr) },
            { key: "confirmed_value_inr", label: "Confirmed", align: "right", render: (o) => o.confirmed_value_inr ? inr(o.confirmed_value_inr) : "-" },
            { key: "cash_received", label: "Cash rcvd", align: "right", render: (o) => o.cash_received ? inr(o.cash_received) : "-" },
            { key: "days_in_stage", label: "Days in stage", align: "right" },
            { key: "owner_name", label: "Owner" },
          ]} />
        </div>
      </Card>
      <div className="space-y-4">
        {newOpp && <NewOpp v={newOpp} setV={setNewOpp} team={team} />}
        {sel ? (
          <Card title={sel.opportunity_name} subtitle={`${sel.opportunity_id} · ${sel.campaign_name || "no campaign"} · brand ${sel.brand_qualification || "-"}`} right={<Btn small kind="ghost" onClick={() => setSel(null)}>Close</Btn>}>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Stage"><select className={inputCls} value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>{STAGES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></Field>
              <Field label="Proposed value (₹)"><input className={inputCls} type="number" value={form.proposed_value_inr ?? ""} onChange={(e) => setForm({ ...form, proposed_value_inr: e.target.value })} /></Field>
              <Field label="Owner"><select className={inputCls} value={form.owner || sel.owner_id || ""} onChange={(e) => setForm({ ...form, owner: e.target.value })}>{team.map((t) => <option key={t.owner_id} value={t.owner_id}>{t.owner_name}</option>)}</select></Field>
              <Field label="Effective (blank = campaign clock)"><input className={inputCls} type="datetime-local" value={form.effective_at} onChange={(e) => setForm({ ...form, effective_at: e.target.value })} /></Field>
              <div className="col-span-2"><Field label="Note"><input className={inputCls} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field></div>
            </div>
            <div className="mt-2 flex items-center gap-2"><Btn onClick={save}>Save new version</Btn><span className="text-[11px] text-slate-400">Adds a full-state history version (history is never overwritten).</span></div>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
              <Field label="Payment received (₹)"><input className={inputCls} type="number" value={form.pay_amount || ""} onChange={(e) => setForm({ ...form, pay_amount: e.target.value })} /></Field>
              <Field label="Received on"><input className={inputCls} type="date" value={form.pay_date || ""} onChange={(e) => setForm({ ...form, pay_date: e.target.value })} /></Field>
              <div className="flex items-end"><Btn kind="outline" onClick={pay}>Record payment</Btn></div>
            </div>
            <div className="mt-2"><Msg m={msg} /></div>
            {detail && (
              <div className="mt-3 space-y-3 border-t border-slate-100 pt-3 text-xs">
                <div><div className="mb-1 font-semibold text-slate-700">Stage history</div>{detail.history.map((h: any) => <div key={h.history_id} className="flex justify-between border-b border-slate-50 py-0.5"><span><Badge color={stageColor(h.stage)}>{label(h.stage)}</Badge> {inr(h.proposed_value_inr)}{h.confirmed_value_inr ? ` · confirmed ${inr(h.confirmed_value_inr)}` : ""} {h.source !== "dataset" && <Badge color="violet">app</Badge>}</span><span className="text-slate-400">{h.effective_at.slice(0, 16)} · {h.owner_name}</span></div>)}</div>
                <div><div className="mb-1 font-semibold text-slate-700">Brand interactions ({detail.interactions.length})</div><div className="max-h-40 overflow-y-auto">{detail.interactions.map((i: any) => <div key={i.interaction_id} className="flex justify-between py-0.5"><span>{label(i.event_type)} <span className="text-slate-400">{i.outcome}</span> · {i.campaign_name}</span><span className="text-slate-400">{i.occurred_at.slice(0, 10)}</span></div>)}</div></div>
                {!!detail.payments.length && <div><div className="mb-1 font-semibold text-slate-700">Payments</div>{detail.payments.map((p: any) => <div key={p.payment_id}>{inr(p.amount_inr)} · {p.status} · {p.received_at?.slice(0, 10)}</div>)}</div>}
              </div>
            )}
          </Card>
        ) : !newOpp && <Card><p className="text-sm text-slate-500">Select an opportunity to change its stage or value, record a payment, or see its full history.</p></Card>}
      </div>
    </div>
  );
}

function NewOpp({ v, setV, team }: any) {
  const { asOf } = useAsOf();
  const brands = useApi<any[]>("/api/brands");
  const camps = useApi<any[]>("/api/campaigns");
  const [msg, setMsg] = useState<any>({});
  const create = async () => { try { const r: any = await mutate("/api/opportunities", "POST", { ...v, asOf }); setMsg({ ok: `Created ${r.opportunity_id} (${r.opportunity_name})` }); } catch (e: any) { setMsg({ err: e.message }); } };
  return (
    <Card title="New opportunity" right={<Btn small kind="ghost" onClick={() => setV(null)}>Close</Btn>}>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2"><Field label="Brand"><input list="brandlist" className={inputCls} value={v.brand} onChange={(e) => setV({ ...v, brand: e.target.value })} placeholder="Type a brand name" /><datalist id="brandlist">{(brands.data || []).map((b) => <option key={b.brand_id} value={b.brand_name} />)}</datalist></Field></div>
        <Field label="Proposed value (₹)"><input className={inputCls} type="number" value={v.proposed_value_inr} onChange={(e) => setV({ ...v, proposed_value_inr: e.target.value })} /></Field>
        <Field label="Campaign"><select className={inputCls} value={v.campaign} onChange={(e) => setV({ ...v, campaign: e.target.value })}><option value="">-</option>{(camps.data || []).map((c) => <option key={c.campaign_id} value={c.campaign_id}>{c.campaign_name}</option>)}</select></Field>
        <Field label="Support"><select className={inputCls} value={v.support_type} onChange={(e) => setV({ ...v, support_type: e.target.value })}><option value="cash">cash</option><option value="in_kind">in kind</option></select></Field>
        <Field label="Deal type"><select className={inputCls} value={v.deal_type} onChange={(e) => setV({ ...v, deal_type: e.target.value })}><option value="new">new</option><option value="renewal">renewal</option></select></Field>
        <Field label="Owner"><select className={inputCls} value={v.owner || ""} onChange={(e) => setV({ ...v, owner: e.target.value })}><option value="">brand owner</option>{team.map((t: any) => <option key={t.owner_id} value={t.owner_id}>{t.owner_name}</option>)}</select></Field>
      </div>
      <div className="mt-2 flex items-center gap-3"><Btn onClick={create}>Create</Btn><Msg m={msg} /></div>
    </Card>
  );
}

function Tasks() {
  const tasks = useApi<any[]>("/api/tasks", false);
  const team = useTeam();
  const [v, setV] = useState<any>({ title: "", owner: "", due_date: istToday(3), priority: "medium" });
  const [msg, setMsg] = useState<any>({});
  const [show, setShow] = useState("open");
  const today = istToday();
  const add = async () => { try { await mutate("/api/tasks", "POST", v); setV({ ...v, title: "" }); setMsg({ ok: "Task added" }); } catch (e: any) { setMsg({ err: e.message }); } };
  const rows = (tasks.data || []).filter((t) => show === "all" || (show === "open" ? t.status !== "done" : t.status === show));
  return (
    <div className="space-y-4">
      <Card title="Add task">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[280px] flex-1"><Field label="Title"><input className={inputCls} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="e.g. Send renewal proposal to Juniper Foods" /></Field></div>
          <Field label="Owner"><select className={inputCls} value={v.owner} onChange={(e) => setV({ ...v, owner: e.target.value })}><option value="">Unassigned</option>{team.map((t) => <option key={t.owner_id} value={t.owner_id}>{t.owner_name}</option>)}</select></Field>
          <Field label="Due"><input type="date" className={inputCls} value={v.due_date} onChange={(e) => setV({ ...v, due_date: e.target.value })} /></Field>
          <Field label="Priority"><select className={inputCls} value={v.priority} onChange={(e) => setV({ ...v, priority: e.target.value })}>{["low", "medium", "high"].map((p) => <option key={p}>{p}</option>)}</select></Field>
          <Btn onClick={add}>Add</Btn><Msg m={msg} />
        </div>
      </Card>
      <Card title="Tasks" right={<select className={inputCls + " text-xs"} value={show} onChange={(e) => setShow(e.target.value)}>{["open", "todo", "in_progress", "blocked", "done", "all"].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>}>
        <Table dense rows={rows} rowKey={(t) => t.task_id} cols={[
          { key: "title", label: "Task", render: (t) => <div><div className="font-medium">{t.title}</div><div className="text-[11px] text-slate-400">{t.task_id}{t.related_type ? ` · ${t.related_type} ${t.related_id}` : ""}{t.initiative_id ? ` · bet ${t.initiative_id}` : ""} · by {t.created_by}{t.source === "simulated" ? " (demo)" : ""}</div></div> },
          { key: "owner", label: "Owner", render: (t) => <select className={inputCls + " text-xs"} value={t.owner_id || ""} onChange={(e) => mutate(`/api/tasks/${t.task_id}`, "PATCH", { owner: e.target.value })}><option value="">-</option>{team.map((m) => <option key={m.owner_id} value={m.owner_id}>{m.owner_name}</option>)}</select> },
          { key: "due_date", label: "Due", render: (t) => <span className={t.status !== "done" && t.due_date && t.due_date < today ? "font-semibold text-rose-600" : ""}>{t.due_date ? fmtDate(t.due_date) : "-"}</span> },
          { key: "priority", label: "Priority", render: (t) => <Badge color={t.priority === "high" ? "red" : t.priority === "medium" ? "amber" : "slate"}>{t.priority}</Badge> },
          { key: "status", label: "Status", render: (t) => <select className={inputCls + " text-xs"} value={t.status} onChange={(e) => mutate(`/api/tasks/${t.task_id}`, "PATCH", { status: e.target.value })}>{["todo", "in_progress", "blocked", "done"].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select> },
          { key: "del", label: "", render: (t) => <Btn small kind="ghost" onClick={() => confirm("Delete task?") && mutate(`/api/tasks/${t.task_id}`, "DELETE")}>Delete</Btn> },
        ]} />
      </Card>
    </div>
  );
}

function Campaigns() {
  const camps = useApi<any[]>("/api/campaigns");
  const team = useTeam();
  const [edits, setEdits] = useState<Record<string, any>>({});
  const [msg, setMsg] = useState<any>({});
  if (!camps.data) return <Loading />;
  const set = (id: string, k: string, v: any) => setEdits({ ...edits, [id]: { ...(edits[id] || {}), [k]: v } });
  const save = async (id: string) => { try { await mutate(`/api/campaigns/${id}`, "PATCH", edits[id]); const e = { ...edits }; delete e[id]; setEdits(e); setMsg({ ok: `Saved ${id}` }); } catch (er: any) { setMsg({ err: er.message }); } };
  return (
    <Card title="Campaigns" subtitle="Status, owner, budget and spend are management fields (the source data has no spend). Results come from live data."><Msg m={msg} />
      <Table rows={camps.data} rowKey={(c) => c.campaign_id} cols={[
        { key: "campaign_name", label: "Campaign", render: (c) => <div><div className="font-medium">{c.campaign_name}</div><div className="text-[11px] text-slate-400">{c.campaign_id} · {c.channel} · {fmtDate(c.planned_start_at)} → {fmtDate(c.planned_end_at)}</div></div> },
        { key: "res", label: "Results", render: (c) => <span className="text-xs">{c.touches} touches · {c.meetings_held} meetings · <b>{c.confirmed} confirmed</b> · {inr(c.confirmed_value, { compact: true })}</span> },
        { key: "status", label: "Status", render: (c) => <select className={inputCls + " text-xs"} value={edits[c.campaign_id]?.status ?? c.status} onChange={(e) => set(c.campaign_id, "status", e.target.value)}>{["active", "scaling", "paused", "stopped"].map((s) => <option key={s}>{s}</option>)}</select> },
        { key: "owner", label: "Owner", render: (c) => <select className={inputCls + " text-xs"} value={edits[c.campaign_id]?.owner ?? c.owner_id} onChange={(e) => set(c.campaign_id, "owner", e.target.value)}>{team.map((t) => <option key={t.owner_id} value={t.owner_id}>{t.owner_name}</option>)}</select> },
        { key: "budget", label: "Budget ₹", render: (c) => <input className={inputCls + " w-24 text-xs"} type="number" value={edits[c.campaign_id]?.budget_inr ?? c.budget_inr ?? ""} onChange={(e) => set(c.campaign_id, "budget_inr", e.target.value)} /> },
        { key: "spent", label: "Spent ₹", render: (c) => <input className={inputCls + " w-24 text-xs"} type="number" value={edits[c.campaign_id]?.spent_inr ?? c.spent_inr ?? ""} onChange={(e) => set(c.campaign_id, "spent_inr", e.target.value)} /> },
        { key: "cpc", label: "Cost / confirmed", align: "right", render: (c) => c.cost_per_confirmed ? inr(c.cost_per_confirmed) : "-" },
        { key: "notes", label: "Notes", render: (c) => <input className={inputCls + " w-44 text-xs"} value={edits[c.campaign_id]?.notes ?? c.notes ?? ""} onChange={(e) => set(c.campaign_id, "notes", e.target.value)} /> },
        { key: "save", label: "", render: (c) => edits[c.campaign_id] ? <Btn small onClick={() => save(c.campaign_id)}>Save</Btn> : null },
      ]} />
    </Card>
  );
}

function Brands() {
  const { asOf } = useAsOf();
  const [s, setS] = useState("");
  const brands = useApi<any[]>(`/api/brands?q=${encodeURIComponent(s)}`);
  const camps = useApi<any[]>("/api/campaigns");
  const team = useTeam();
  const [ix, setIx] = useState<any>({ brand: "", campaign: "", event_type: "replied", outcome: "positive", occurred_at: "" });
  const [nb, setNb] = useState<any>({ brand_name: "", industry: "", owner: "", contact_name: "", job_title: "" });
  const [msg, setMsg] = useState<any>({});
  const logIx = async () => { try { const r: any = await mutate("/api/interactions", "POST", { ...ix, asOf }); setMsg({ ok: `Logged ${ix.event_type} at ${r.occurred_at}` }); } catch (e: any) { setMsg({ err: e.message }); } };
  const addBrand = async () => { try { const r: any = await mutate("/api/brands", "POST", { ...nb, asOf }); setMsg({ ok: `Brand ${r.brand_id} created` }); setNb({ brand_name: "", industry: "", owner: "", contact_name: "", job_title: "" }); } catch (e: any) { setMsg({ err: e.message }); } };
  const qual = async (b: any, status: string) => { try { await mutate(`/api/brands/${b.brand_id}/qualification`, "POST", { status, asOf }); setMsg({ ok: `${b.brand_name} → ${status}` }); } catch (e: any) { setMsg({ err: e.message }); } };
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2" title="Brands" subtitle="Qualification is a separate record from replies and deals; changing it adds a new version." right={<input placeholder="Search" className={inputCls + " text-xs"} value={s} onChange={(e) => setS(e.target.value)} />}>
        <Msg m={msg} />
        <div className="max-h-[600px] overflow-y-auto">{brands.data ? <Table dense rows={brands.data} rowKey={(b) => b.brand_id} cols={[
          { key: "brand_name", label: "Brand", render: (b) => <div><div className="font-medium">{b.brand_name}</div><div className="text-[11px] text-slate-400">{b.brand_id} · {b.industry} · {b.owner_name}</div></div> },
          { key: "interactions", label: "Touches", align: "right" }, { key: "opportunities", label: "Opps", align: "right" },
          { key: "last_touch_at", label: "Last touch", render: (b) => fmtDate(b.last_touch_at) },
          { key: "q", label: "Qualification", render: (b) => <select className={inputCls + " text-xs"} value={b.qualification_status || ""} onChange={(e) => qual(b, e.target.value)}>{["unreviewed", "engaged", "qualified", "unqualified", "dormant"].map((x) => <option key={x}>{x}</option>)}</select> },
        ]} /> : <Loading />}</div>
      </Card>
      <div className="space-y-4">
        <Card title="Log outreach / response">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2"><Field label="Brand"><input list="bl2" className={inputCls} value={ix.brand} onChange={(e) => setIx({ ...ix, brand: e.target.value })} /><datalist id="bl2">{(brands.data || []).map((b) => <option key={b.brand_id} value={b.brand_name} />)}</datalist></Field></div>
            <Field label="Campaign"><select className={inputCls} value={ix.campaign} onChange={(e) => setIx({ ...ix, campaign: e.target.value })}><option value="">-</option>{(camps.data || []).map((c) => <option key={c.campaign_id} value={c.campaign_id}>{c.campaign_name}</option>)}</select></Field>
            <Field label="Event"><select className={inputCls} value={ix.event_type} onChange={(e) => setIx({ ...ix, event_type: e.target.value })}>{["outreach_sent", "delivered", "replied", "meeting_booked", "meeting_held", "opt_out", "introduction_received", "web_inbound"].map((x) => <option key={x} value={x}>{label(x)}</option>)}</select></Field>
            {ix.event_type === "replied" && <Field label="Reply outcome"><select className={inputCls} value={ix.outcome} onChange={(e) => setIx({ ...ix, outcome: e.target.value })}>{["positive", "neutral", "not_interested", "wrong_contact"].map((x) => <option key={x}>{x}</option>)}</select></Field>}
            <Field label="When (blank = campaign clock)"><input type="datetime-local" className={inputCls} value={ix.occurred_at} onChange={(e) => setIx({ ...ix, occurred_at: e.target.value })} /></Field>
          </div>
          <div className="mt-2"><Btn onClick={logIx}>Log</Btn></div>
        </Card>
        <Card title="Add brand">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Brand name"><input className={inputCls} value={nb.brand_name} onChange={(e) => setNb({ ...nb, brand_name: e.target.value })} /></Field>
            <Field label="Industry"><input className={inputCls} value={nb.industry} onChange={(e) => setNb({ ...nb, industry: e.target.value })} /></Field>
            <Field label="Owner"><select className={inputCls} value={nb.owner} onChange={(e) => setNb({ ...nb, owner: e.target.value })}><option value="">Kabir Shah</option>{team.map((t) => <option key={t.owner_id} value={t.owner_id}>{t.owner_name}</option>)}</select></Field>
            <Field label="Contact name"><input className={inputCls} value={nb.contact_name} onChange={(e) => setNb({ ...nb, contact_name: e.target.value })} /></Field>
          </div>
          <div className="mt-2"><Btn onClick={addBrand}>Add brand</Btn></div>
        </Card>
      </div>
    </div>
  );
}

function Payments() {
  const pays = useApi<any[]>("/api/payments", false);
  const ov = useApi<any>("/api/overview");
  return (
    <Card title="Payments received" subtitle="The source data has no bank receipts. Cash collected = payments recorded here (from the opportunity panel or the copilot).">
      {ov.data && <div className="mb-3 text-sm">Recorded: <b>{inr(ov.data.cashReceived)}</b> of {inr(ov.data.cashConfirmedValue)} confirmed cash ({pct(ov.data.cashReceived / Math.max(1, ov.data.cashConfirmedValue))}).</div>}
      <Table dense rows={pays.data || []} empty="No payments recorded yet" cols={[
        { key: "opportunity_name", label: "Opportunity" }, { key: "amount_inr", label: "Amount", align: "right", render: (p) => inr(p.amount_inr) },
        { key: "status", label: "Status" }, { key: "received_at", label: "Received", render: (p) => p.received_at?.slice(0, 16) }, { key: "note", label: "Note" },
      ]} />
    </Card>
  );
}

function Targets() {
  const { asOf } = useAsOf();
  const t = useApi<any[]>("/api/targets", false);
  const [v, setV] = useState<any>({ target_version: "Updated plan", qualified_brands_goal: "", confirmed_partnerships_goal: "", cash_goal_inr: "", effective_at: "" });
  const [msg, setMsg] = useState<any>({});
  const add = async () => { try { const r: any = await mutate("/api/targets", "POST", { ...v, asOf }); setMsg({ ok: `Target version added (effective ${r.effective_at})` }); } catch (e: any) { setMsg({ err: e.message }); } };
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card title="Target versions" subtitle="The version in effect at a snapshot is the latest one effective before it.">
        <Table dense rows={t.data || []} cols={[{ key: "target_version", label: "Version" }, { key: "effective_at", label: "Effective", render: (r) => r.effective_at.slice(0, 16) }, { key: "qualified_brands_goal", label: "Qualified goal", align: "right" }, { key: "confirmed_partnerships_goal", label: "Confirmed goal", align: "right" }, { key: "cash_goal_inr", label: "Cash goal", align: "right", render: (r) => r.cash_goal_inr ? inr(r.cash_goal_inr) : "-" }, { key: "source", label: "Source" }]} />
      </Card>
      <Card title="Add a target version">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Label"><input className={inputCls} value={v.target_version} onChange={(e) => setV({ ...v, target_version: e.target.value })} /></Field>
          <Field label="Effective (blank = campaign clock)"><input type="datetime-local" className={inputCls} value={v.effective_at} onChange={(e) => setV({ ...v, effective_at: e.target.value })} /></Field>
          <Field label="Qualified brands goal"><input type="number" className={inputCls} value={v.qualified_brands_goal} onChange={(e) => setV({ ...v, qualified_brands_goal: e.target.value })} /></Field>
          <Field label="Confirmed partnerships goal"><input type="number" className={inputCls} value={v.confirmed_partnerships_goal} onChange={(e) => setV({ ...v, confirmed_partnerships_goal: e.target.value })} /></Field>
          <Field label="Cash goal (₹, optional)"><input type="number" className={inputCls} value={v.cash_goal_inr} onChange={(e) => setV({ ...v, cash_goal_inr: e.target.value })} /></Field>
        </div>
        <div className="mt-2 flex items-center gap-3"><Btn onClick={add}>Add version</Btn><Msg m={msg} /></div>
      </Card>
    </div>
  );
}

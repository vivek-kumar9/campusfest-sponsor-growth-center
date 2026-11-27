import { q, q1 } from "./db";

export const OPEN_STAGES = ["prospecting", "contacted", "proposal_sent", "negotiating"];
export const STAGE_ORDER = ["prospecting", "contacted", "proposal_sent", "negotiating", "partner_confirmed"];
const FAR = "9999-12-31 00:00:00";

export type Ctx = { asOf: string | null; cut: string; ref: string; label: string };

/** As-of date D (YYYY-MM-DD) means end of D in Asia/Kolkata -> exclusive cut-off D+1 00:00. null = latest (all data). */
export async function resolveCtx(asOf?: string | null): Promise<Ctx> {
  if (asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    const d = new Date(asOf + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1);
    const cut = d.toISOString().slice(0, 10) + " 00:00:00";
    return { asOf, cut, ref: cut, label: `end of ${asOf} (IST)` };
  }
  // latest: reference clock = latest recorded activity in the data (not wall-clock), so durations stay meaningful
  const r = await q1(`select greatest(
      (select max(occurred_at) from interactions), (select max(effective_at) from opportunity_history),
      (select max(effective_at) from qualification_history), (select max(received_at) from payments),
      (select (history_end + 1)::timestamp from event))::text as ref`);
  return { asOf: null, cut: FAR, ref: r.ref, label: `latest data (activity clock ${r.ref.slice(0, 16)})` };
}

const days = (a: string, b: string) => (Date.parse(b.replace(" ", "T") + "Z") - Date.parse(a.replace(" ", "T") + "Z")) / 864e5;
const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r1 = (x: number | null) => (x === null || x === undefined || !isFinite(x) ? null : Math.round(x * 10) / 10);
const r3 = (x: number | null) => (x === null || x === undefined || !isFinite(x) ? null : Math.round(x * 1000) / 1000);

export async function getEvent() {
  return q1(`select event_name, history_start::text, history_end::text, event_starts_at::text, event_ends_at::text, timezone, currency from event where id=1`);
}

/** Opportunity snapshot as of the cut-off: latest version per opportunity plus derived fields. */
export async function oppSnapshot(ctx: Ctx) {
  const rows = await q(`
    select o.opportunity_id, o.opportunity_name, o.brand_id, b.brand_name, b.industry, o.campaign_id, c.campaign_name, c.channel_group,
      o.support_type, o.deal_type, o.created_at::text as created_at, o.primary_contact_id,
      s.stage, s.proposed_value_inr, s.confirmed_value_inr, s.owner_id, s.owner_name, s.stage_effective_at::text as stage_since,
      (select min(h.effective_at) from opportunity_history h where h.opportunity_id=o.opportunity_id and h.stage='partner_confirmed' and h.effective_at < $1)::text as first_confirmed_at,
      (select min(h.effective_at) from opportunity_history h where h.opportunity_id=o.opportunity_id and h.stage in ('proposal_sent','negotiating','partner_confirmed') and h.effective_at < $1)::text as first_proposal_at,
      (select max(case h.stage when 'prospecting' then 1 when 'contacted' then 2 when 'proposal_sent' then 3 when 'negotiating' then 4 when 'partner_confirmed' then 5 else 0 end) from opportunity_history h where h.opportunity_id=o.opportunity_id and h.effective_at < $1)::int as max_stage_rank,
      (select max(i.occurred_at) from interactions i where i.brand_id=o.brand_id and i.occurred_at < $1)::text as last_touch_at,
      coalesce((select sum(p.amount_inr) from payments p where p.opportunity_id=o.opportunity_id and p.status='received' and coalesce(p.received_at,p.created_at) < $1),0)::int as cash_received,
      (select bq.qualification_status from brand_qual_asof($1) bq where bq.brand_id=o.brand_id) as brand_qualification,
      (select bq2.qualification_status from brand_qual_asof(o.created_at + interval '1 second') bq2 where bq2.brand_id=o.brand_id) as qualification_at_creation
    from opportunities o
    join opp_state_asof($1) s on s.opportunity_id = o.opportunity_id
    left join brands b on b.brand_id = o.brand_id
    left join campaigns c on c.campaign_id = o.campaign_id
    where o.created_at < $1
    order by o.opportunity_id`, [ctx.cut]);
  return rows.map((r: any) => ({
    ...r,
    days_in_stage: r1(days(r.stage_since, ctx.ref)),
    days_since_touch: r.last_touch_at ? r1(days(r.last_touch_at, ctx.ref)) : null,
    is_open: OPEN_STAGES.includes(r.stage),
  }));
}

/** Win probability per (channel_group, stage) from opportunities resolved by the cut-off, Laplace-smoothed. */
export function winModel(opps: any[]) {
  const resolved = opps.filter((o) => ["partner_confirmed", "lost", "withdrawn"].includes(o.stage));
  // an opportunity "reached" a stage if any version before the cut-off was at or beyond it
  const reached = (o: any, st: string) => (o.max_stage_rank || 0) >= STAGE_ORDER.indexOf(st) + 1;
  const table: Record<string, Record<string, { wins: number; n: number; p: number }>> = {};
  for (const g of ["warm", "inbound", "cold", "all"]) {
    table[g] = {};
    for (const st of OPEN_STAGES) {
      const pool = resolved.filter((o) => (g === "all" || o.channel_group === g) && reached(o, st));
      const wins = pool.filter((o) => o.stage === "partner_confirmed").length;
      table[g][st] = { wins, n: pool.length, p: (wins + 1) / (pool.length + 2) };
    }
  }
  return table;
}

export async function overview(ctx: Ctx) {
  const ev = await getEvent();
  const target = await q1(`select target_version, effective_at::text, qualified_brands_goal, confirmed_partnerships_goal, cash_goal_inr, source from target_asof($1)`, [ctx.cut]);
  const qual = await q(`select qualification_status, count(*)::int as n from brand_qual_asof($1) group by 1`, [ctx.cut]);
  const qualMap: Record<string, number> = Object.fromEntries(qual.map((r: any) => [r.qualification_status, r.n]));
  const opps = await oppSnapshot(ctx);
  const confirmed = opps.filter((o) => o.stage === "partner_confirmed");
  const cashConf = confirmed.filter((o) => o.support_type === "cash");
  const open = opps.filter((o) => o.is_open);
  const daysToEvent = days(ctx.ref, ev.event_starts_at);
  const wm = winModel(opps);
  // median days from first proposal to confirmation among confirmed deals (cycle-time feasibility)
  const cyc = median(confirmed.filter((o) => o.first_proposal_at && o.first_confirmed_at).map((o) => days(o.first_proposal_at, o.first_confirmed_at))) ?? 5;
  const expected = open.map((o) => {
    const cell = wm[o.channel_group || "all"]?.[o.stage] || wm.all[o.stage];
    const timeOk = daysToEvent <= 0 ? 0 : Math.min(1, daysToEvent / Math.max(cyc, 1));
    const stale = o.days_in_stage !== null && o.days_in_stage > 3 * Math.max(cyc, 3) ? 0.5 : 1;
    const p = cell.p * timeOk * stale;
    return { ...o, win_p: r3(p), expected_value: Math.round(p * (o.proposed_value_inr || 0)) };
  });
  const sum = (xs: any[], f: (x: any) => number) => xs.reduce((a, x) => a + (f(x) || 0), 0);
  const brands = await q1(`select
      (select count(*)::int from brands where created_at < $1) as researched,
      (select count(distinct brand_id)::int from interactions where origin_interaction_id is null and occurred_at < $1) as touched,
      (select count(distinct brand_id)::int from interactions where event_type='replied' and occurred_at < $1) as responded,
      (select count(distinct brand_id)::int from interactions where event_type='meeting_held' and occurred_at < $1) as met`, [ctx.cut]);
  const pay = await q1(`select coalesce(sum(amount_inr),0)::int as received, count(*)::int as n from payments where status='received' and coalesce(received_at,created_at) < $1`, [ctx.cut]);
  const byStage = OPEN_STAGES.map((st) => ({ stage: st, count: open.filter((o) => o.stage === st).length, value: sum(open.filter((o) => o.stage === st), (o) => o.proposed_value_inr) }));
  return {
    ctx, event: ev, daysToEvent: r1(daysToEvent), eventPassed: daysToEvent <= 0,
    target,
    qualified: qualMap.qualified || 0, qualificationMix: qualMap,
    confirmedCount: confirmed.length, confirmedValue: sum(confirmed, (o) => o.confirmed_value_inr),
    cashConfirmedValue: sum(cashConf, (o) => o.confirmed_value_inr), cashConfirmedCount: cashConf.length,
    inKindConfirmedValue: sum(confirmed.filter((o) => o.support_type !== "cash"), (o) => o.confirmed_value_inr),
    cashReceived: pay.received, paymentsCount: pay.n,
    openCount: open.length, openValue: sum(open, (o) => o.proposed_value_inr), openByStage: byStage,
    lostCount: opps.filter((o) => o.stage === "lost").length, withdrawnCount: opps.filter((o) => o.stage === "withdrawn").length,
    opportunities: opps.length,
    forecast: {
      method: "Open deals × P(win | channel group, stage) from deals resolved by the cut-off (Laplace-smoothed) × time-to-event feasibility × 0.5 if stalled >3× median cycle",
      medianProposalToConfirmDays: r1(cyc),
      expectedAdditionalDeals: r1(sum(expected, (o) => o.win_p)), expectedAdditionalValue: sum(expected, (o) => o.expected_value),
      projectedConfirmedCount: r1(confirmed.length + sum(expected, (o) => o.win_p)),
      projectedConfirmedValue: sum(confirmed, (o) => o.confirmed_value_inr) + sum(expected, (o) => o.expected_value),
      winModel: wm,
    },
    brandFunnel: brands,
  };
}

/** Brand-level funnel. group_by: none | channel_group | campaign | industry */
export async function funnel(ctx: Ctx, groupBy = "none") {
  const key = groupBy === "campaign" ? "c.campaign_name" : groupBy === "channel_group" ? "c.channel_group" : groupBy === "industry" ? "b.industry" : "'all'";
  const rows = await q(`
    with touches as (select i.brand_id, i.campaign_id, i.event_type, i.outcome, i.origin_interaction_id from interactions i where i.occurred_at < $1),
    qual as (select * from brand_qual_asof($1)),
    opp as (select o.*, s.stage from opportunities o join opp_state_asof($1) s using (opportunity_id) where o.created_at < $1),
    reached as (select distinct h.opportunity_id from opportunity_history h where h.effective_at < $1 and h.stage in ('proposal_sent','negotiating','partner_confirmed'))
    select ${key} as grp, 'touched' as step, count(distinct t.brand_id)::int as brands from touches t left join campaigns c on c.campaign_id=t.campaign_id left join brands b on b.brand_id=t.brand_id where t.origin_interaction_id is null group by 1
    union all select ${key}, 'responded', count(distinct t.brand_id)::int from touches t left join campaigns c on c.campaign_id=t.campaign_id left join brands b on b.brand_id=t.brand_id where t.event_type='replied' group by 1
    union all select ${key}, 'positive_reply', count(distinct t.brand_id)::int from touches t left join campaigns c on c.campaign_id=t.campaign_id left join brands b on b.brand_id=t.brand_id where t.outcome='positive' group by 1
    union all select ${key}, 'meeting_held', count(distinct t.brand_id)::int from touches t left join campaigns c on c.campaign_id=t.campaign_id left join brands b on b.brand_id=t.brand_id where t.event_type='meeting_held' group by 1
    union all select ${key}, 'qualified', count(distinct qq.brand_id)::int from qual qq left join campaigns c on c.campaign_id=qq.campaign_id left join brands b on b.brand_id=qq.brand_id where qq.qualification_status='qualified' group by 1
    union all select ${key}, 'opportunity', count(distinct o.brand_id)::int from opp o left join campaigns c on c.campaign_id=o.campaign_id left join brands b on b.brand_id=o.brand_id group by 1
    union all select ${key}, 'proposal_sent', count(distinct o.brand_id)::int from opp o join reached r using (opportunity_id) left join campaigns c on c.campaign_id=o.campaign_id left join brands b on b.brand_id=o.brand_id group by 1
    union all select ${key}, 'confirmed', count(distinct o.brand_id)::int from opp o left join campaigns c on c.campaign_id=o.campaign_id left join brands b on b.brand_id=o.brand_id where o.stage='partner_confirmed' group by 1
  `, [ctx.cut]);
  const steps = ["touched", "responded", "positive_reply", "meeting_held", "qualified", "opportunity", "proposal_sent", "confirmed"];
  const groups: Record<string, Record<string, number>> = {};
  for (const r of rows as any[]) { const g = r.grp ?? "unattributed"; groups[g] = groups[g] || {}; groups[g][r.step] = r.brands; }
  const out = Object.entries(groups).map(([grp, m]) => ({
    group: grp,
    steps: steps.map((s, i) => ({ step: s, brands: m[s] || 0, conv_from_prev: i === 0 ? null : r3((m[steps[i - 1]] || 0) ? (m[s] || 0) / (m[steps[i - 1]] || 0) : null) })),
    touched_to_confirmed: r3((m.touched || 0) ? (m.confirmed || 0) / m.touched : null),
  }));
  return { ctx, groupBy, attribution: "Each step counts distinct brands; campaign = the campaign recorded on that record (interaction, qualification source, or opportunity origin). Associations are observational, not causal.", groups: out };
}

export async function campaignPerformance(ctx: Ctx) {
  const rows = await q(`
    with i as (select * from interactions where occurred_at < $1),
    opp as (select o.*, s.stage, s.confirmed_value_inr, s.proposed_value_inr from opportunities o join opp_state_asof($1) s using (opportunity_id) where o.created_at < $1),
    qual as (select * from brand_qual_asof($1))
    select c.campaign_id, c.campaign_name, c.channel, c.channel_group, c.owner_id, c.owner_name, c.status, c.budget_inr, c.spent_inr, c.notes,
      c.planned_start_at::text, c.planned_end_at::text,
      (select count(*)::int from i where i.campaign_id=c.campaign_id and i.origin_interaction_id is null) as touches,
      (select count(distinct i.brand_id)::int from i where i.campaign_id=c.campaign_id) as brands_touched,
      (select count(*)::int from i where i.campaign_id=c.campaign_id and i.event_type='delivered') as delivered,
      (select count(*)::int from i where i.campaign_id=c.campaign_id and i.event_type='replied') as replies,
      (select count(*)::int from i where i.campaign_id=c.campaign_id and i.outcome='positive') as positive_replies,
      (select count(*)::int from i where i.campaign_id=c.campaign_id and i.outcome in ('not_interested','wrong_contact')) as negative_replies,
      (select count(*)::int from i where i.campaign_id=c.campaign_id and i.event_type='opt_out') as opt_outs,
      (select count(*)::int from i where i.campaign_id=c.campaign_id and i.event_type='meeting_booked') as meetings_booked,
      (select count(*)::int from i where i.campaign_id=c.campaign_id and i.event_type='meeting_held') as meetings_held,
      (select count(*)::int from qual where qual.campaign_id=c.campaign_id and qual.qualification_status='qualified') as qualified_brands,
      (select count(*)::int from opp where opp.campaign_id=c.campaign_id) as opportunities,
      (select count(*)::int from opp where opp.campaign_id=c.campaign_id and opp.stage='partner_confirmed') as confirmed,
      (select coalesce(sum(opp.confirmed_value_inr),0)::int from opp where opp.campaign_id=c.campaign_id and opp.stage='partner_confirmed') as confirmed_value,
      (select coalesce(sum(opp.confirmed_value_inr),0)::int from opp where opp.campaign_id=c.campaign_id and opp.stage='partner_confirmed' and opp.support_type='cash') as cash_confirmed_value,
      (select count(*)::int from opp where opp.campaign_id=c.campaign_id and opp.stage in ('lost','withdrawn')) as lost_or_withdrawn,
      (select count(*)::int from opp where opp.campaign_id=c.campaign_id and opp.stage in ('prospecting','contacted','proposal_sent','negotiating')) as open_opps,
      (select coalesce(sum(opp.proposed_value_inr),0)::int from opp where opp.campaign_id=c.campaign_id and opp.stage in ('prospecting','contacted','proposal_sent','negotiating')) as open_value
    from campaigns c order by c.campaign_id`, [ctx.cut]);
  return rows.map((c: any) => {
    const resolved = c.confirmed + c.lost_or_withdrawn;
    return {
      ...c,
      reply_rate: r3(c.touches ? c.replies / c.touches : null),
      positive_rate: r3(c.touches ? c.positive_replies / c.touches : null),
      meeting_rate: r3(c.touches ? c.meetings_held / c.touches : null),
      opt_out_rate: r3(c.touches ? c.opt_outs / c.touches : null),
      win_rate_resolved: r3(resolved ? c.confirmed / resolved : null),
      confirmed_per_100_touches: r1(c.touches ? (100 * c.confirmed) / c.touches : null),
      cost_per_confirmed: c.spent_inr && c.confirmed ? Math.round(c.spent_inr / c.confirmed) : null,
    };
  });
}

export async function ownerPerformance(ctx: Ctx) {
  const opps = await oppSnapshot(ctx);
  const team = await q(`select t.owner_id, t.owner_name,
      (select count(*)::int from brands b where b.owner_id=t.owner_id and b.created_at < $1) as brands_owned,
      (select count(*)::int from interactions i where i.owner_id=t.owner_id and i.occurred_at < $1) as interactions_logged,
      (select count(*)::int from tasks k where k.owner_id=t.owner_id and k.status <> 'done') as open_tasks,
      (select count(*)::int from tasks k where k.owner_id=t.owner_id and k.status <> 'done' and k.due_date < (now() at time zone 'Asia/Kolkata')::date) as overdue_tasks
    from team t order by t.owner_id`, [ctx.cut]);
  return team.map((t: any) => {
    const mine = opps.filter((o) => o.owner_id === t.owner_id);
    const conf = mine.filter((o) => o.stage === "partner_confirmed");
    const open = mine.filter((o) => o.is_open);
    return { ...t, opportunities: mine.length, confirmed: conf.length, confirmed_value: conf.reduce((a, o) => a + o.confirmed_value_inr, 0),
      open_opps: open.length, open_value: open.reduce((a, o) => a + (o.proposed_value_inr || 0), 0), stalled_opps: open.filter((o) => (o.days_in_stage || 0) >= 10).length,
      lost: mine.filter((o) => o.stage === "lost" || o.stage === "withdrawn").length };
  });
}

export async function stalledDeals(ctx: Ctx, minDays = 10) {
  const opps = await oppSnapshot(ctx);
  return opps.filter((o) => o.is_open && (o.days_in_stage || 0) >= minDays).sort((a, b) => (b.proposed_value_inr || 0) - (a.proposed_value_inr || 0));
}

/** Daily cumulative series: confirmed count/value, qualified brands and target lines. */
export async function trend(ctx: Ctx) {
  const ev = await getEvent();
  const endRow = ctx.asOf ? null : await q1(`select greatest((select history_end from event), (select max(occurred_at)::date from interactions), (select max(effective_at)::date from opportunity_history), (select max(effective_at)::date from qualification_history))::text as d`);
  const end = ctx.asOf ? ctx.asOf : (endRow as any).d;
  const rows = await q(`
    select d::date::text as day,
      (select count(*)::int from opp_state_asof((d::date + 1)::timestamp) s where s.stage='partner_confirmed') as confirmed,
      (select coalesce(sum(s.confirmed_value_inr),0)::int from opp_state_asof((d::date + 1)::timestamp) s where s.stage='partner_confirmed') as confirmed_value,
      (select count(*)::int from brand_qual_asof((d::date + 1)::timestamp) b where b.qualification_status='qualified') as qualified,
      (select t.confirmed_partnerships_goal from target_asof((d::date + 1)::timestamp) t) as confirmed_goal,
      (select t.qualified_brands_goal from target_asof((d::date + 1)::timestamp) t) as qualified_goal,
      (select count(*)::int from interactions i where i.origin_interaction_id is null and i.occurred_at >= d and i.occurred_at < d + interval '1 day') as touches,
      (select count(*)::int from interactions i where i.event_type='meeting_held' and i.occurred_at >= d and i.occurred_at < d + interval '1 day') as meetings
    from generate_series($1::date, $2::date, interval '1 day') d order by 1`, [ev.history_start, end]);
  return { ctx, eventStart: ev.event_starts_at.slice(0, 10), series: rows };
}

/** Diagnostics: evidence-backed findings, each with the numbers behind it. */
export async function bottlenecks(ctx: Ctx) {
  const [ov, camps, owners] = await Promise.all([overview(ctx), campaignPerformance(ctx), ownerPerformance(ctx)]);
  const opps = await oppSnapshot(ctx);
  const findings: any[] = [];
  const grp = (g: string) => camps.filter((c: any) => c.channel_group === g);
  const agg = (cs: any[], f: string) => cs.reduce((a: number, c: any) => a + (c[f] || 0), 0);
  for (const g of ["warm", "inbound", "cold"]) {
    const cs = grp(g); if (!cs.length) continue;
    const touches = agg(cs, "touches"), opp = agg(cs, "opportunities"), conf = agg(cs, "confirmed"), lostw = agg(cs, "lost_or_withdrawn"), open = agg(cs, "open_opps");
    findings.push({ type: "channel_summary", group: g, campaigns: cs.map((c: any) => c.campaign_name), touches, meetings_held: agg(cs, "meetings_held"), qualified: agg(cs, "qualified_brands"), opportunities: opp, confirmed: conf, lost_or_withdrawn: lostw, open_opps: open, open_value: agg(cs, "open_value"), confirmed_value: agg(cs, "confirmed_value"), win_rate_resolved: conf + lostw ? r3(conf / (conf + lostw)) : null, confirmed_per_100_touches: touches ? r1((100 * conf) / touches) : null });
  }
  const cold = findings.find((f) => f.group === "cold"); const warm = findings.find((f) => f.group === "warm");
  if (cold && cold.opportunities >= 5 && cold.confirmed === 0) findings.push({ type: "bottleneck", severity: "high", title: "Cold-sourced deals stall after proposal", evidence: `Cold campaigns produced ${cold.opportunities} opportunities but 0 confirmed (${cold.lost_or_withdrawn} lost/withdrawn, ${cold.open_opps} still open worth ₹${cold.open_value.toLocaleString("en-IN")}).`, implication: "Pipeline value from cold outreach should not be counted toward target without a changed approach." });
  if (warm && warm.opportunities) findings.push({ type: "strength", severity: "info", title: "Warm introductions convert", evidence: `Warm campaigns: ${warm.confirmed} confirmed of ${warm.opportunities} opportunities (${warm.touches} touches).` });
  const stalled = opps.filter((o) => o.is_open && (o.days_in_stage || 0) >= 10);
  if (stalled.length) findings.push({ type: "bottleneck", severity: stalled.length > 5 ? "high" : "medium", title: `${stalled.length} open deals stalled ≥10 days in stage`, evidence: `Stalled value ₹${stalled.reduce((a, o) => a + (o.proposed_value_inr || 0), 0).toLocaleString("en-IN")}; median days in stage ${r1(median(stalled.map((o) => o.days_in_stage)))}.`, deals: stalled.slice(0, 8).map((o) => ({ id: o.opportunity_id, name: o.brand_name, stage: o.stage, days_in_stage: o.days_in_stage, value: o.proposed_value_inr, owner: o.owner_name })) });
  const unq = opps.filter((o) => o.qualification_at_creation && o.qualification_at_creation !== "qualified");
  if (unq.length) { const w = unq.filter((o) => o.stage === "partner_confirmed").length; findings.push({ type: "process", severity: "medium", title: "Opportunities opened before the brand was qualified", evidence: `${unq.length} opportunities were created while the brand was not 'qualified'; ${w} of them confirmed. Opportunities created on qualified brands: ${opps.length - unq.length}, confirmed ${opps.filter((o) => o.qualification_at_creation === "qualified" && o.stage === "partner_confirmed").length}.` }); }
  const totalBrands = owners.reduce((a: number, o: any) => a + o.brands_owned, 0);
  for (const o of owners) if (totalBrands && o.brands_owned / totalBrands > 0.5 && o.opportunities === 0) findings.push({ type: "capacity", severity: "medium", title: `${o.owner_name} owns ${Math.round((100 * o.brands_owned) / totalBrands)}% of brands but no opportunities`, evidence: `${o.brands_owned} of ${totalBrands} brands; ${o.interactions_logged} interactions logged; 0 opportunities owned.`, implication: "Account ownership and deal ownership are split; check hand-offs and whether this capacity is better used on warm/renewal work." });
  const optouts = camps.filter((c: any) => c.opt_outs > 0);
  for (const c of optouts) findings.push({ type: "risk", severity: "low", title: `${c.campaign_name}: ${c.opt_outs} opt-outs`, evidence: `${c.opt_outs} do-not-contact responses from ${c.touches} touches (${(100 * (c.opt_out_rate || 0)).toFixed(1)}%).` });
  const conf = opps.filter((o) => o.stage === "partner_confirmed" && o.support_type === "cash" && o.first_confirmed_at);
  const ev = ov.event; const late = conf.filter((o) => days(o.first_confirmed_at, ev.event_starts_at) < 30);
  if (conf.length) findings.push({ type: "cash_timing", severity: late.length / conf.length > 0.3 ? "high" : "medium", title: "Time-to-cash risk on late confirmations", evidence: `${late.length} of ${conf.length} cash partnerships (₹${late.reduce((a, o) => a + o.confirmed_value_inr, 0).toLocaleString("en-IN")}) were confirmed <30 days before the event; recorded payments: ₹${ov.cashReceived.toLocaleString("en-IN")}.`, implication: "Confirmed value is not bank receipt. Without advance terms, late deals are unlikely to pay before the fest (Indian B2B invoices typically take 50+ days to clear)." });
  const withdrawn = opps.filter((o) => o.stage === "withdrawn");
  for (const w of withdrawn) findings.push({ type: "data_note", severity: "low", title: `${w.brand_name}: withdrawn`, evidence: `${w.opportunity_name} is now 'withdrawn' (since ${w.stage_since.slice(0, 10)}). It is not counted as confirmed, even if it was confirmed earlier.` });
  return { ctx, findings, targetGap: ov.target ? { confirmed: ov.confirmedCount - (ov.target.confirmed_partnerships_goal || 0), qualified: ov.qualified - (ov.target.qualified_brands_goal || 0) } : null };
}

/** Bet KPIs computed from live data and compared with the scale/stop thresholds. */
export async function initiativeStatus(ctx: Ctx) {
  const inits = await q(`select i.*, t.owner_name from initiatives i left join team t on t.owner_id=i.owner_id order by rank`);
  const ov = await overview(ctx);
  const opps = await oppSnapshot(ctx);
  const tasks = await q(`select initiative_id, count(*) filter (where status<>'done')::int as open_tasks, count(*) filter (where status='done')::int as done_tasks from tasks group by 1`);
  const refDay = ctx.ref;
  const perWeek = async (eventType: string, campaignIds: string[]) => {
    const r = await q1(`select count(*) filter (where occurred_at >= ($1::timestamp - interval '14 days'))::int as last14,
        count(*)::int as total, min(occurred_at)::text as first, max(occurred_at)::text as last
      from interactions where event_type=$2 and occurred_at < $1 ${campaignIds.length ? "and campaign_id = any($3)" : ""}`, campaignIds.length ? [refDay, eventType, campaignIds] : [refDay, eventType]);
    const spanWeeks = r.first ? Math.max(1, days(r.first, r.last) / 7) : null;
    return { trailing14: r1(r.last14 / 2), campaignAverage: spanWeeks ? r1(r.total / spanWeeks) : null, total: r.total, lastAt: r.last };
  };
  const out = [];
  for (const it of inits as any[]) {
    let value: number | null = null, n: number | null = null, note = "";
    if (it.kpi_key === "cash_collected_share") {
      value = ov.cashConfirmedValue ? ov.cashReceived / ov.cashConfirmedValue : null; n = ov.paymentsCount;
      note = ov.paymentsCount ? `${ov.paymentsCount} payments recorded (${Math.round(ov.cashReceived).toLocaleString("en-IN")} of ${Math.round(ov.cashConfirmedValue).toLocaleString("en-IN")} confirmed cash)` : "No payment receipts recorded yet. Source data reports confirmed value only, which is not proof of bank receipt.";
    } else if (it.kpi_key === "renewal_win_rate") {
      const ren = opps.filter((o) => o.deal_type === "renewal");
      const res = ren.filter((o) => ["partner_confirmed", "lost", "withdrawn"].includes(o.stage)); n = res.length;
      value = res.length ? res.filter((o) => o.stage === "partner_confirmed").length / res.length : null;
      note = ren.length ? `${ren.length} renewal opportunities, ${res.length} resolved (${ren.length - res.length} open)` : "No renewal opportunities in the data yet (2025 is the first edition in the dataset). Create opportunities with deal type 'renewal' to track.";
    } else if (it.kpi_key === "warm_intros_per_week" || it.kpi_key === "inbound_per_week") {
      const w = await perWeek(it.kpi_key === "warm_intros_per_week" ? "introduction_received" : "web_inbound", []);
      const active = !ov.eventPassed && w.lastAt && days(w.lastAt, refDay) < 14;
      value = active ? w.trailing14 : w.campaignAverage; n = w.total;
      note = active ? `Trailing 14 days; campaign average ${w.campaignAverage}/week` : `Campaign-to-date average (no activity in the last 14 days, last on ${w.lastAt?.slice(0, 10) || "n/a"})`;
    } else if (it.kpi_key === "cold_proposal_win_rate") {
      const cold = opps.filter((o) => o.channel_group === "cold" && o.first_proposal_at); n = cold.length;
      value = cold.length ? cold.filter((o) => o.stage === "partner_confirmed").length / cold.length : null;
      note = `${cold.length} cold opportunities reached proposal; ${cold.filter((o) => o.stage === "partner_confirmed").length} confirmed`;
    }
    let signal = "No data";
    if (it.kpi_key === "cash_collected_share" && !n) value = null;
    if (value !== null) {
      const minN: Record<string, number> = { cold_proposal_win_rate: 10, renewal_win_rate: 5, cash_collected_share: 5 };
      if ((n || 0) < (minN[it.kpi_key] || 0)) signal = "Keep testing";
      else if (value >= it.scale_threshold) signal = "Scale";
      else if (value < it.stop_threshold) signal = "Stop";
      else signal = "Change";
    }
    const t = (tasks as any[]).find((x) => x.initiative_id === it.initiative_id);
    out.push({ ...it, kpi_value: value === null ? null : r3(value), kpi_n: n, kpi_note: note, signal, open_tasks: t?.open_tasks || 0, done_tasks: t?.done_tasks || 0,
      score: r3(((it.expected_incremental_inr || 0) / 1e5) * (it.confidence || 0) / Math.max(it.effort_weeks || 1, 0.5)) });
  }
  return { ctx, initiatives: out, scoreFormula: "score = expected incremental cash collected (₹ lakh) × confidence ÷ effort (person-weeks)" };
}

/** 2026 growth model (base vs stretch) from the editable assumptions table, with optional overrides. */
export async function growthModel(overrides: Record<string, number> = {}) {
  const rows = await q(`select key, label, value, unit, source_tag, note from assumptions order by sort`);
  const D: Record<string, number> = Object.fromEntries((rows as any[]).map((r) => [r.key, r.value]));
  const A: Record<string, number> = { ...D };
  const applied: Record<string, number> = {};
  for (const [k, v] of Object.entries(overrides)) if (k in A && typeof v === "number" && isFinite(v)) { A[k] = v; applied[k] = v; }
  const calc = (p: any) => { const deals = p.n * p.conv; const signed = deals * p.deal; return { prospects: p.n, conv: r3(p.conv), deals: r1(deals), avg_deal: Math.round(p.deal), signed: Math.round(signed), collection_rate: r3(p.coll), collected: Math.round(signed * p.coll) }; };
  const build = (X: Record<string, number>) => {
    const seg = (name: string, b: any, st: any) => ({ segment: name, base: calc(b), stretch: calc(st) });
    const segments = [
      seg("Renewals (2025 cash partners)", { n: X.renew_pool, conv: X.renew_rate_base, deal: X.renew_deal_base, coll: X.coll_std_renew }, { n: X.renew_pool, conv: X.renew_rate_stretch, deal: X.renew_deal_stretch, coll: X.coll_adv_renew }),
      seg("Warm intros (alumni, partners, creators)", { n: X.warm_intros_base, conv: X.warm_conv_base, deal: X.warm_deal, coll: X.coll_std_warm }, { n: X.warm_intros_stretch, conv: X.warm_conv_stretch, deal: X.warm_deal, coll: X.coll_adv_warm }),
      seg("Inbound partner form", { n: X.inbound_base, conv: X.inbound_conv, deal: X.inbound_deal, coll: X.coll_std_inbound }, { n: X.inbound_stretch, conv: X.inbound_conv, deal: X.inbound_deal, coll: X.coll_adv_inbound }),
      seg("Cold outbound (qualified first)", { n: X.cold_qualified, conv: X.cold_conv_base, deal: X.cold_deal, coll: X.coll_adv_cold }, { n: X.cold_qualified, conv: X.cold_conv_stretch, deal: X.cold_deal, coll: X.coll_adv_cold }),
    ];
    const tot = (k: "base" | "stretch") => ({ deals: r1(segments.reduce((a, s) => a + (s[k].deals || 0), 0)), signed: segments.reduce((a, s) => a + s[k].signed, 0), collected: segments.reduce((a, s) => a + s[k].collected, 0) });
    return { segments, base: tot("base"), stretch: tot("stretch") };
  };
  const scenario = build(A);
  const hasOverrides = Object.keys(applied).length > 0;
  const def = hasOverrides ? build(D) : null;
  return {
    assumptions: rows.map((r: any) => ({ ...r, default_value: D[r.key], value: A[r.key], overridden: r.key in applied })),
    overridesApplied: applied, segments: scenario.segments, base: scenario.base, stretch: scenario.stretch,
    ...(def ? { default_model: { base: def.base, stretch: def.stretch }, change_vs_default: {
      base_collected: scenario.base.collected - def.base.collected, stretch_collected: scenario.stretch.collected - def.stretch.collected,
      base_signed: scenario.base.signed - def.base.signed, stretch_signed: scenario.stretch.signed - def.stretch.signed } } : {}),
    budgetCap: A.growth_budget_cap,
    note: "Base = 2025 playbook repeated + renewals at the base rate, standard payment terms. Stretch = all five bets. Collection rates convert signed cash into cash received before the fest." + (hasOverrides ? " This is a what-if scenario: 'default_value' is the saved assumption, 'value' is the value used here; compare with default_model." : ""),
  };
}

export async function dataCoverage() {
  const counts = await q1(`select (select count(*)::int from brands) brands, (select count(*)::int from contacts) contacts, (select count(*)::int from campaigns) campaigns,
     (select count(*)::int from interactions) interactions, (select count(*)::int from qualification_history) qualification_versions,
     (select count(*)::int from opportunities) opportunities, (select count(*)::int from opportunity_history) opportunity_versions,
     (select count(*)::int from payments) payments, (select count(*)::int from tasks) tasks,
     (select min(occurred_at)::text from interactions) first_interaction, (select max(occurred_at)::text from interactions) last_interaction,
     (select count(*)::int from opportunity_history where source <> 'dataset') + (select count(*)::int from interactions where source <> 'dataset') + (select count(*)::int from qualification_history where source <> 'dataset') + (select count(*)::int from opportunities where source <> 'dataset') + (select count(*)::int from brands where source <> 'dataset') as user_added_records`);
  const importLog = await q(`select * from import_log order by table_name`);
  const ev = await getEvent();
  return {
    event: ev, counts, importLog,
    available: ["brands (industry, owner)", "contacts (job title)", "6 sponsor acquisition campaigns (channel, owner, planned dates)", "outreach events: sent, delivered, replied (positive/neutral/not_interested/wrong_contact), meetings booked/held, opt-outs, introductions, web inbound", "brand qualification history (full-state versions)", "opportunities with stage history and proposed/confirmed INR values, support type cash vs in_kind", "targets (launch plan, revised plan on 15 Mar 2025)", "3 sponsor activations linked to attendee campaigns (association only)"],
    not_available: ["bank receipts / cash collected (confirmed value is not cash; only payments recorded in this app count)", "campaign spend, tool costs or team hours (budgets in this app are plan assumptions)", "sponsor-side ROI, impressions or leads delivered to sponsors", "reasons for lost deals beyond stage", "prior-year renewal history (2025 is the only edition in the data)", "contract terms, invoices, payment due dates", "attendee numbers (separate dataset, not loaded)", "city/geography of brands"],
    rules: ["As-of date D = end of D in Asia/Kolkata; only records strictly before D+1 00:00 count", "Latest full-state version per entity; history versions are never summed", "Duplicate source IDs with identical payloads were dropped at import (see importLog)", "A positive reply is not qualification; qualification is not a confirmed partnership", "Confirmed partnerships = opportunities whose latest stage is partner_confirmed (withdrawn after confirmation does not count)"],
  };
}

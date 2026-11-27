import { q, q1, getDb } from "./db";
import * as A from "./analytics";
import { istNow, istDate } from "./seed";

// ---------- LLM client (OpenAI-compatible; default = Gemini's OpenAI endpoint) ----------
const BASE = (process.env.LLM_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/$/, "");
const KEY = () => process.env.LLM_API_KEY || process.env.GEMINI_API_KEY || "";
export const CANDIDATE_MODELS = () => Array.from(new Set([
  ...(process.env.LLM_MODEL || process.env.GEMINI_MODEL ? [String(process.env.LLM_MODEL || process.env.GEMINI_MODEL)] : []),
  "gemini-flash-latest", "gemini-3.5-flash", "gemini-2.5-flash", "gemini-flash-lite-latest", "gemini-3.5-flash-lite", "gemini-2.5-flash-lite",
]));
// remembered across requests on a warm instance, so a failing model is not retried on every call
let preferred: { model: string; reasoning: boolean } | null = null;
const badUntil: Record<string, number> = {};

async function chat(messages: any[], tools: any[] | null, model: string, reasoning: boolean, timeoutMs: number, toolChoice: "auto" | "none" = "auto") {
  const body: any = { model, messages, temperature: 0.2 };
  if (tools) { body.tools = tools; body.tool_choice = toolChoice; }
  if (reasoning) body.reasoning_effort = "low";
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), Math.max(3000, timeoutMs));
  try {
    const res = await fetch(`${BASE}/chat/completions`, { method: "POST", signal: ctl.signal, headers: { "content-type": "application/json", authorization: `Bearer ${KEY()}` }, body: JSON.stringify(body) });
    const text = await res.text();
    if (!res.ok) { const err: any = new Error(`LLM ${res.status}: ${text.slice(0, 300)}`); err.status = res.status; throw err; }
    return JSON.parse(text);
  } catch (e: any) {
    if (e?.name === "AbortError") { const err: any = new Error(`LLM timeout after ${Math.round(timeoutMs / 1000)}s`); err.status = 408; throw err; }
    throw e;
  } finally { clearTimeout(timer); }
}

async function chatWithFallback(messages: any[], tools: any[] | null, state: { model?: string; reasoning: boolean; deadline: number; errors: string[] }, toolChoice: "auto" | "none" = "auto") {
  let lastErr: any;
  const start = state.model ? [{ model: state.model, reasoning: state.reasoning }] : preferred ? [preferred] : [];
  const order = [...start, ...CANDIDATE_MODELS().filter((m) => !start.some((x) => x.model === m)).map((m) => ({ model: m, reasoning: true }))];
  for (const cand of order) {
    if ((badUntil[cand.model] || 0) > Date.now() && cand.model !== state.model) continue;
    for (const reasoning of cand.reasoning ? [true, false] : [false]) {
      const left = state.deadline - Date.now();
      if (left < 4000) throw lastErr || new Error("Out of time");
      try {
        const r = await chat(messages, tools, cand.model, reasoning, Math.min(25000, left - 1000), toolChoice);
        state.model = cand.model; state.reasoning = reasoning; preferred = { model: cand.model, reasoning };
        return r;
      } catch (e: any) {
        lastErr = e; state.errors.push(`${cand.model}${reasoning ? "+reasoning" : ""}: ${String(e.message).slice(0, 120)}`);
        if (e.status === 400 && reasoning) continue; // retry the same model without reasoning_effort
        if ([404, 400, 403].includes(e.status)) badUntil[cand.model] = Date.now() + 30 * 60e3;
        if (e.status === 429 || e.status === 408 || e.status >= 500) badUntil[cand.model] = Date.now() + 60e3;
        if (preferred?.model === cand.model) preferred = null;
        break;
      }
    }
  }
  throw lastErr || new Error("No model available");
}

/** Diagnostics: which models this API key can use right now (tiny prompt, no tools). */
export async function llmCheck() {
  if (!KEY()) return { configured: false };
  let available: string[] = [];
  try {
    const r = await fetch(`${BASE}/models`, { headers: { authorization: `Bearer ${KEY()}` }, signal: AbortSignal.timeout(4000) });
    const j: any = await r.json().catch(() => ({}));
    available = (j.data || []).map((m: any) => String(m.id || "").replace(/^models\//, "")).filter((id: string) => /flash|pro/.test(id)).slice(0, 60);
  } catch {}
  const results = await Promise.all(CANDIDATE_MODELS().map(async (m) => {
    const t0 = Date.now();
    try { await chat([{ role: "user", content: "Reply with the word ok." }], null, m, false, 6000); return { model: m, ok: true, ms: Date.now() - t0 }; }
    catch (e: any) { return { model: m, ok: false, status: e.status, ms: Date.now() - t0, error: String(e.message).slice(0, 160) }; }
  }));
  return { configured: true, base: BASE, preferred, available, results };
}

// ---------- tools ----------
const asOfProp = { as_of: { type: "string", description: "Snapshot date YYYY-MM-DD (end of that day, IST). Omit for the latest data." } };
const T = (name: string, description: string, properties: any = {}, required: string[] = []) => ({ type: "function", function: { name, description, parameters: required.length ? { type: "object", properties, required } : { type: "object", properties } } });

const ASSUMPTION_KEYS = ["renew_pool", "renew_rate_base", "renew_rate_stretch", "renew_deal_base", "renew_deal_stretch", "warm_intros_base", "warm_intros_stretch", "warm_conv_base", "warm_conv_stretch", "warm_deal", "inbound_base", "inbound_stretch", "inbound_conv", "inbound_deal", "cold_qualified", "cold_conv_base", "cold_conv_stretch", "cold_deal", "coll_std_renew", "coll_std_warm", "coll_std_inbound", "coll_adv_renew", "coll_adv_warm", "coll_adv_inbound", "coll_adv_cold", "growth_budget_cap", "team_capacity_weeks"];
const ACTION_PARAM_PROPS: Record<string, any> = {
  title: { type: "string" }, description: { type: "string" }, owner: { type: "string", description: "team member name or id" }, due_date: { type: "string", description: "YYYY-MM-DD" },
  priority: { type: "string", enum: ["low", "medium", "high"] }, related_type: { type: "string", enum: ["opportunity", "campaign", "initiative", "brand"] }, related_id: { type: "string" },
  initiative_id: { type: "string" }, task_id: { type: "string" }, status: { type: "string", description: "task: todo|in_progress|blocked|done; campaign: active|scaling|paused|stopped; initiative: active|paused|stopped" },
  campaign_id: { type: "string" }, budget_inr: { type: "number" }, notes: { type: "string" }, opportunity_id: { type: "string" },
  stage: { type: "string", enum: ["prospecting", "contacted", "proposal_sent", "negotiating", "partner_confirmed", "lost", "withdrawn"] }, proposed_value_inr: { type: "number" }, note: { type: "string" },
  decision: { type: "string" }, amount_inr: { type: "number" }, received_at: { type: "string", description: "YYYY-MM-DD" },
};

export const TOOLS = [
  T("get_overview", "Headline KPIs at a snapshot: active target version, qualified brands vs goal, confirmed partnerships (count, value, cash vs in-kind) vs goal, recorded cash received, open pipeline by stage, days to event, and a projection of confirmed deals/value at the event with its method.", asOfProp),
  T("get_funnel", "Brand-level funnel (touched → responded → positive reply → meeting held → qualified → opportunity → proposal sent → confirmed) with step conversion rates. Optionally grouped.", { ...asOfProp, group_by: { type: "string", enum: ["none", "channel_group", "campaign", "industry"] } }),
  T("get_campaign_performance", "Per sponsor-acquisition campaign: touches, replies, reply/positive/meeting/opt-out rates, qualified brands, opportunities, confirmed count/value, win rate on resolved deals, open pipeline, status, budget and spend fields.", asOfProp),
  T("get_owner_performance", "Per team member: brands owned, interactions logged, opportunities, confirmed, open and stalled deals, open/overdue tasks.", asOfProp),
  T("list_opportunities", "List opportunities at a snapshot with stage, values, owner, campaign, channel group, days in stage, days since last touch, cash received. Filter and sort.", {
    ...asOfProp, stage: { type: "array", items: { type: "string", enum: ["prospecting", "contacted", "proposal_sent", "negotiating", "partner_confirmed", "lost", "withdrawn"] } },
    open_only: { type: "boolean" }, channel_group: { type: "string", enum: ["warm", "inbound", "cold"] }, campaign: { type: "string" }, owner: { type: "string" },
    support_type: { type: "string", enum: ["cash", "in_kind"] }, min_days_in_stage: { type: "number" }, min_value: { type: "number" }, search: { type: "string", description: "brand or opportunity name contains" },
    sort_by: { type: "string", enum: ["value", "days_in_stage", "created_at"] }, limit: { type: "integer" } }),
  T("get_opportunity_detail", "Full history of one opportunity (stage versions, values, owner), the brand's interactions, qualification history, payments and linked tasks. Accepts an opportunity id (e.g. O053), brand name or opportunity name.", { opportunity: { type: "string" } }, ["opportunity"]),
  T("find_bottlenecks", "Computed diagnostics with evidence: channel-group summaries, where deals stall, stalled deals, process issues (opportunities before qualification), owner capacity concentration, opt-out risk, time-to-cash risk, data notes.", asOfProp),
  T("get_trend", "Time series aggregated by week (or day): confirmed partnerships and value (cumulative), qualified brands (cumulative) with target lines, new touches and meetings per period.", { ...asOfProp, granularity: { type: "string", enum: ["week", "day"] } }),
  T("get_initiatives", "The five growth bets (initiatives): owner, budget, expected incremental cash, confidence, effort, priority score, KPI computed from live data vs scale/stop thresholds, signal (Scale/Change/Stop/Keep testing/No data), linked tasks.", asOfProp),
  T("get_growth_model", "Next-edition sponsorship cash model (base vs stretch) by segment from the editable assumptions table, each assumption tagged dataset/benchmark/assumption. Pass overrides to run what-if scenarios without saving (rates are ratios, e.g. 0.5 = 50%).", { overrides: { type: "array", description: "What-if changes, e.g. [{key:'renew_rate_stretch', value:0.5}]", items: { type: "object", properties: { key: { type: "string", enum: ASSUMPTION_KEYS }, value: { type: "number" } }, required: ["key", "value"] } } }),
  T("list_tasks", "Tasks in the management tool with owner, due date, status, priority and what they relate to.", { status: { type: "string", enum: ["todo", "in_progress", "blocked", "done", "open"] }, owner: { type: "string" }, overdue_only: { type: "boolean" } }),
  T("get_data_coverage", "What the data contains and does NOT contain (e.g. no bank receipts, no spend), record counts, import de-duplication log and the counting rules. Use before answering anything that may need missing data.", { topic: { type: "string", description: "optional: what you need to check" } }),
  T("run_sql", "Run one read-only SQL SELECT (Postgres) for questions the other tools don't cover. Max 200 rows returned. Prefer the as-of helper functions for snapshots.", { query: { type: "string" }, purpose: { type: "string" } }, ["query", "purpose"]),
  T("propose_actions", "Propose changes for the user to confirm in the UI. Nothing is executed until the user clicks Confirm. Types: create_task {title, owner, due_date YYYY-MM-DD, priority low|medium|high, description, related_type opportunity|campaign|initiative|brand, related_id, initiative_id}; update_task {task_id, status, owner, due_date}; update_campaign {campaign_id, status active|paused|stopped|scaling, budget_inr, notes}; update_opportunity_stage {opportunity_id, stage, proposed_value_inr, note}; update_initiative {initiative_id, status, decision, budget_inr}; record_payment {opportunity_id, amount_inr, received_at}.", {
    actions: { type: "array", items: { type: "object", properties: { type: { type: "string", enum: ["create_task", "update_task", "update_campaign", "update_opportunity_stage", "update_initiative", "record_payment"] }, summary: { type: "string", description: "One line shown to the user" }, params: { type: "object", description: "Fields for the action type (others omitted)", properties: ACTION_PARAM_PROPS } }, required: ["type", "summary", "params"] } } }, ["actions"]),
];

const SQL_DOC = `Tables (timestamps are IST wall-clock 'timestamp'):
brands(brand_id, brand_name, industry, owner_id, owner_name, created_at, source)
contacts(contact_id, contact_name, job_title, brand_id, created_at)
campaigns(campaign_id SC01..SC06, campaign_name, channel email|linkedin|introduction|web_inbound, channel_group warm|inbound|cold, owner_id, owner_name, planned_start_at, planned_end_at, status, budget_inr, spent_inr, notes)
interactions(interaction_id, attempt_id, origin_interaction_id [null on root touch], brand_id, contact_id, campaign_id, owner_id, channel, event_type outreach_sent|delivered|replied|meeting_booked|meeting_held|opt_out|introduction_received|web_inbound, outcome sent|delivered|positive|neutral|not_interested|wrong_contact|scheduled|attended|do_not_contact|introduced|interest_submitted, summary, occurred_at)
qualification_history(history_id, brand_id, campaign_id, qualification_status unreviewed|engaged|qualified|unqualified|dormant, reason, effective_at)  -- full-state versions: never sum, take latest
opportunities(opportunity_id, opportunity_name, brand_id, primary_contact_id, campaign_id [originating], support_type cash|in_kind, deal_type new|renewal, created_at)
opportunity_history(history_id, opportunity_id, brand_id, stage prospecting|contacted|proposal_sent|negotiating|partner_confirmed|lost|withdrawn, proposed_value_inr, confirmed_value_inr [0 unless partner_confirmed], owner_id, owner_name, effective_at)  -- full-state versions
targets(effective_at, qualified_brands_goal, confirmed_partnerships_goal, cash_goal_inr, target_version)
payments(payment_id, opportunity_id, amount_inr, status received|invoiced, received_at)  -- app-recorded receipts only
tasks(task_id, title, owner_id, due_date, status todo|in_progress|blocked|done, priority, related_type, related_id, initiative_id)
initiatives(initiative_id I1..I5, rank, name, owner_id, budget_inr, spent_inr, expected_incremental_inr, confidence, effort_weeks, kpi_key, scale_threshold, stop_threshold)
team(owner_id, owner_name); activations(brand_id, opportunity_id, attendee_campaign_name, linked_at); event(event_starts_at, event_ends_at, history_start, history_end)
Helper functions (cut = exclusive cut-off; for date D use cut_of('D') = D+1 00:00):
opp_state_asof(cut) -> (opportunity_id, stage, proposed_value_inr, confirmed_value_inr, owner_id, owner_name, stage_effective_at, history_id)
brand_qual_asof(cut) -> (brand_id, qualification_status, reason, campaign_id, qual_effective_at)
target_asof(cut) -> (target_version, effective_at, qualified_brands_goal, confirmed_partnerships_goal, cash_goal_inr)
Views: v_opportunities (opportunity + brand_name, industry, campaign_name, channel_group), v_interactions (interaction + names).
Latest snapshot: use cut '9999-12-31'. Example: select v.brand_name, s.stage from opp_state_asof(cut_of('2025-03-15')) s join v_opportunities v using (opportunity_id);`;

function validateSql(sql: string) {
  const s = sql.trim().replace(/;+\s*$/, "");
  if (s.includes(";")) throw new Error("Only one statement is allowed");
  if (!/^(select|with)\b/i.test(s)) throw new Error("Only SELECT/WITH queries are allowed");
  if (/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|call|do|vacuum|analyze|lock|listen|notify|set|reset|pg_sleep|pg_read_file|pg_terminate|dblink|lo_import)\b/i.test(s.replace(/'[^']*'/g, "''"))) throw new Error("Statement contains a disallowed keyword");
  return s;
}

const compactOpp = (o: any) => ({ id: o.opportunity_id, brand: o.brand_name, stage: o.stage, proposed_inr: o.proposed_value_inr, confirmed_inr: o.confirmed_value_inr, support: o.support_type, deal_type: o.deal_type,
  owner: o.owner_name, campaign: o.campaign_name, group: o.channel_group, industry: o.industry, created: o.created_at?.slice(0, 10), stage_since: o.stage_since?.slice(0, 10), days_in_stage: o.days_in_stage,
  last_touch: o.last_touch_at?.slice(0, 10), days_since_touch: o.days_since_touch, cash_received_inr: o.cash_received, brand_qualification: o.brand_qualification });

async function execTool(name: string, args: any, sess: { proposals: any[]; asOfDefault: string | null }) {
  const ctxFor = async (a: any) => A.resolveCtx(a?.as_of || sess.asOfDefault);
  switch (name) {
    case "get_overview": {
      const o = await A.overview(await ctxFor(args));
      const { winModel, ...fc } = o.forecast as any;
      const wm = Object.fromEntries(Object.entries(winModel).map(([g, st]: any) => [g, Object.fromEntries(Object.entries(st).map(([k, v]: any) => [k, `${v.wins}/${v.n} won → p=${v.p.toFixed(2)}`]))]));
      return { as_of: o.ctx.label, event: o.event, days_to_event: o.daysToEvent, event_passed: o.eventPassed, target: o.target, qualified_brands: o.qualified, qualification_mix: o.qualificationMix,
        confirmed_partnerships: o.confirmedCount, confirmed_value_inr: o.confirmedValue, cash_confirmed_inr: o.cashConfirmedValue, cash_confirmed_deals: o.cashConfirmedCount, in_kind_confirmed_inr: o.inKindConfirmedValue,
        cash_received_recorded_inr: o.cashReceived, payment_records: o.paymentsCount, open_deals: o.openCount, open_pipeline_inr: o.openValue, open_by_stage: o.openByStage, lost: o.lostCount, withdrawn: o.withdrawnCount,
        total_opportunities: o.opportunities, brand_funnel: o.brandFunnel, forecast: { ...fc, win_probability_by_group_stage: wm } };
    }
    case "get_funnel": { const f = await A.funnel(await ctxFor(args), args?.group_by || "none"); return { as_of: f.ctx.label, attribution: f.attribution, groups: f.groups }; }
    case "get_campaign_performance": { const ctx = await ctxFor(args); return { as_of: ctx.label, note: "Rates use root touches as denominator. Budget/spend are empty unless entered in the app (no spend in source data).", campaigns: await A.campaignPerformance(ctx) }; }
    case "get_owner_performance": { const ctx = await ctxFor(args); return { as_of: ctx.label, owners: await A.ownerPerformance(ctx) }; }
    case "list_opportunities": {
      const ctx = await ctxFor(args); let rows = await A.oppSnapshot(ctx);
      if (args?.stage?.length) rows = rows.filter((o) => args.stage.includes(o.stage));
      if (args?.open_only) rows = rows.filter((o) => o.is_open);
      if (args?.channel_group) rows = rows.filter((o) => o.channel_group === args.channel_group);
      if (args?.campaign) rows = rows.filter((o) => (o.campaign_name || "").toLowerCase().includes(String(args.campaign).toLowerCase()) || o.campaign_id === args.campaign);
      if (args?.owner) rows = rows.filter((o) => (o.owner_name || "").toLowerCase().includes(String(args.owner).toLowerCase()) || o.owner_id === args.owner);
      if (args?.support_type) rows = rows.filter((o) => o.support_type === args.support_type);
      if (args?.min_days_in_stage) rows = rows.filter((o) => (o.days_in_stage || 0) >= args.min_days_in_stage);
      if (args?.min_value) rows = rows.filter((o) => (o.proposed_value_inr || 0) >= args.min_value);
      if (args?.search) rows = rows.filter((o) => `${o.brand_name} ${o.opportunity_name}`.toLowerCase().includes(String(args.search).toLowerCase()));
      const sb = args?.sort_by || "value";
      rows.sort((a, b) => sb === "days_in_stage" ? (b.days_in_stage || 0) - (a.days_in_stage || 0) : sb === "created_at" ? a.created_at.localeCompare(b.created_at) : (b.proposed_value_inr || 0) - (a.proposed_value_inr || 0));
      const lim = Math.min(Math.max(args?.limit || 30, 1), 60);
      return { as_of: ctx.label, total_matching: rows.length, sum_proposed_inr: rows.reduce((a, o) => a + (o.proposed_value_inr || 0), 0), sum_confirmed_inr: rows.reduce((a, o) => a + (o.confirmed_value_inr || 0), 0), shown: Math.min(lim, rows.length), rows: rows.slice(0, lim).map(compactOpp) };
    }
    case "get_opportunity_detail": {
      const key = String(args?.opportunity || "");
      const o = await q1(`select * from v_opportunities where opportunity_id=$1 or lower(opportunity_name)=lower($1) or lower(brand_name)=lower($1) order by opportunity_id limit 1`, [key])
        || await q1(`select * from v_opportunities where lower(brand_name) like '%'||lower($1)||'%' or lower(opportunity_name) like '%'||lower($1)||'%' order by opportunity_id limit 1`, [key]);
      if (!o) return { error: `No opportunity matching '${key}'` };
      const others = await q(`select opportunity_id, opportunity_name from opportunities where brand_id=$1 and opportunity_id<>$2`, [o.brand_id, o.opportunity_id]);
      return {
        opportunity: { ...o, created_at: String(o.created_at) }, other_opportunities_same_brand: others,
        stage_history: await q(`select stage, proposed_value_inr, confirmed_value_inr, owner_name, effective_at::text, source from opportunity_history where opportunity_id=$1 order by effective_at, history_id`, [o.opportunity_id]),
        qualification_history: await q(`select qualification_status, reason, effective_at::text from qualification_history where brand_id=$1 order by effective_at`, [o.brand_id]),
        interactions: await q(`select campaign_name, event_type, outcome, contact_name, occurred_at::text from v_interactions where brand_id=$1 order by occurred_at`, [o.brand_id]),
        payments: await q(`select amount_inr, status, received_at::text from payments where opportunity_id=$1`, [o.opportunity_id]),
        tasks: await q(`select task_id, title, status, due_date::text from tasks where related_id=$1`, [o.opportunity_id]),
      };
    }
    case "find_bottlenecks": { const b = await A.bottlenecks(await ctxFor(args)); return { as_of: b.ctx.label, target_gap: b.targetGap, findings: b.findings }; }
    case "get_trend": {
      const t = await A.trend(await ctxFor(args)); const gran = args?.granularity === "day" ? "day" : "week";
      if (gran === "day") return { as_of: t.ctx.label, event_start: t.eventStart, series: t.series };
      const weeks: Record<string, any> = {};
      for (const r of t.series as any[]) {
        const d = new Date(r.day + "T00:00:00Z"); const wd = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - wd); const k = d.toISOString().slice(0, 10);
        const w = (weeks[k] = weeks[k] || { week_start: k, touches: 0, meetings: 0 });
        w.touches += r.touches; w.meetings += r.meetings; w.confirmed_cumulative = r.confirmed; w.confirmed_value_cumulative = r.confirmed_value; w.qualified_cumulative = r.qualified; w.confirmed_goal = r.confirmed_goal; w.qualified_goal = r.qualified_goal;
      }
      return { as_of: t.ctx.label, event_start: t.eventStart, weekly: Object.values(weeks) };
    }
    case "get_initiatives": { const i = await A.initiativeStatus(await ctxFor(args)); return { as_of: i.ctx.label, score_formula: i.scoreFormula, initiatives: i.initiatives.map((x: any) => ({ id: x.initiative_id, rank: x.rank, name: x.name, owner: x.owner_name, status: x.status, decision: x.decision, budget_inr: x.budget_inr, spent_inr: x.spent_inr, weeks: `${x.start_week}-${x.end_week}`, expected_incremental_collected_inr: x.expected_incremental_inr, confidence: x.confidence, effort_person_weeks: x.effort_weeks, score: x.score, kpi: x.kpi_label, kpi_value: x.kpi_value, kpi_n: x.kpi_n, kpi_note: x.kpi_note, scale_threshold: x.scale_threshold, stop_threshold: x.stop_threshold, threshold_rule: x.threshold_note, signal: x.signal, open_tasks: x.open_tasks })) }; }
    case "get_growth_model": {
      const ov: Record<string, number> = {};
      const raw = args?.overrides;
      if (Array.isArray(raw)) for (const o of raw) { if (o && typeof o.key === "string" && isFinite(Number(o.value))) ov[o.key] = Number(o.value); }
      else if (raw && typeof raw === "object") for (const [k, v] of Object.entries(raw)) if (isFinite(Number(v))) ov[k] = Number(v);
      return A.growthModel(ov);
    }
    case "list_tasks": {
      let rows: any[] = await q(`select k.task_id, k.title, t.owner_name as owner, k.due_date::text as due_date, k.status, k.priority, k.related_type, k.related_id, k.initiative_id, k.created_by from tasks k left join team t on t.owner_id=k.owner_id order by k.due_date nulls last`);
      const today = istDate(0);
      if (args?.status === "open") rows = rows.filter((r) => r.status !== "done"); else if (args?.status) rows = rows.filter((r) => r.status === args.status);
      if (args?.owner) rows = rows.filter((r) => (r.owner || "").toLowerCase().includes(String(args.owner).toLowerCase()));
      if (args?.overdue_only) rows = rows.filter((r) => r.status !== "done" && r.due_date && r.due_date < today);
      return { today_ist: today, count: rows.length, tasks: rows.slice(0, 60) };
    }
    case "get_data_coverage": return A.dataCoverage();
    case "run_sql": {
      const sql = validateSql(String(args?.query || ""));
      const db = await getDb();
      const r = await db.readOnly(sql, 4000);
      return { purpose: args?.purpose, row_count: r.rows.length, columns: r.columns, rows: r.rows.slice(0, 200), truncated: r.rows.length > 200 };
    }
    case "propose_actions": {
      const out = [];
      for (const a of (args?.actions || []).slice(0, 10)) {
        const id = `ACT${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
        await q(`insert into pending_actions (action_id, action_type, payload, summary, status, created_at) values ($1,$2,$3,$4,'pending',$5)`, [id, a.type, JSON.stringify(a.params || {}), a.summary || a.type, istNow()]);
        const p = { action_id: id, action_type: a.type, summary: a.summary, payload: a.params, status: "pending" };
        sess.proposals.push(p); out.push(p);
      }
      return { proposed: out.length, note: "Shown to the user with Confirm / Reject buttons. NOT executed yet - do not say it is done.", actions: out };
    }
  }
  return { error: `Unknown tool ${name}` };
}

function systemPrompt(asOf: string | null) {
  return `You are the Growth Analyst & Copilot inside the CampusFest Sponsorship Growth Center. The team is maximising sponsorship CASH collected before the festival.
Today's real date (IST) is ${istDate(0)}. The loaded campaign data is the CampusFest 2025 sponsor dataset (fictional; records 15 Jan-20 Apr 2025; event 12-13 Apr 2025) plus any edits made in this app.
The user is currently viewing: ${asOf ? `as of end of ${asOf} (IST)` : "latest data"}. Use that snapshot unless the user names another date.

How to work:
1. Ground every number in a tool result from THIS conversation turn or an earlier one. Never invent or estimate figures from general knowledge. If a tool can compute it, call the tool. Do arithmetic with tool numbers only, and show the formula for derived numbers (e.g. 24 ÷ 28 = 86%).
2. Prefer the specific tools; use run_sql only for questions they don't cover. For follow-up questions, reuse context but re-query if the snapshot or filter changes.
3. Separate clearly: **Data** (from tools), **Assumption** (assumption-tagged inputs, e.g. growth model), **Inference** (your reasoning). Say how confident you are when it matters.
4. Be honest about limits. The data has NO bank receipts (confirmed value ≠ cash collected; only payments recorded in the app count), NO campaign spend/costs, NO sponsor-side ROI, NO renewal history, NO reasons for losses beyond stage. If the question needs missing data, say exactly what is missing, give the closest proxy the data supports (labelled as a proxy), and say what to record to answer it properly. If a sample is small (n<10), say so.
5. Counting rules: latest full-state version per entity as of the cut-off; a withdrawn deal is not confirmed even if confirmed earlier; positive reply ≠ qualified ≠ confirmed; campaign attribution is observational (record-level source), not causal.
6. Recommendations: tie each to evidence and to a lever (scale, change, stop, reallocate). When the user wants to act, or when a concrete next step is obvious, call propose_actions (tasks with owner + due date, campaign status changes, stage updates). Due dates use real dates from today (${istDate(0)}). Proposals are executed only after the user clicks Confirm; never say an action is done unless the user confirmed it.
7. Style: lead with the answer in 1-2 sentences, then the supporting numbers (short bullets or a small table), then caveats/next step. Use ₹ with Indian grouping (₹22,40,000 or ₹22.4L). Mention the snapshot date used. Keep it under ~250 words unless asked for detail. Use plain hyphens, never em dashes.

Team: Riya Kapoor (T01), Kabir Shah (T02), Meera Iyer (T03), Nisha Rao (T05). Channel groups: warm = Warm Partner Introductions + Creator Network Referrals; inbound = Partner Interest Form; cold = Brand Discovery Email, Brand Leader LinkedIn, Past Conversation Revival.

SQL reference for run_sql:
${SQL_DOC}`;
}

const summarize = (name: string, r: any) => {
  if (r?.error) return `error: ${r.error}`;
  if (name === "run_sql") return `${r.row_count} rows`;
  if (name === "list_opportunities") return `${r.total_matching} matching, ${r.shown} shown`;
  if (name === "propose_actions") return `${r.proposed} action(s) awaiting confirmation`;
  if (name === "find_bottlenecks") return `${r.findings?.length} findings`;
  if (name === "get_overview") return `${r.confirmed_partnerships} confirmed, ${r.qualified_brands} qualified (${r.as_of})`;
  return "ok";
};

export async function runCopilot(body: { messages: { role: string; content: string }[]; asOf?: string | null }) {
  const asOf = body.asOf && /^\d{4}-\d{2}-\d{2}$/.test(body.asOf) ? body.asOf : null;
  const history = (body.messages || []).filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 6000) }));
  if (!history.length || history[history.length - 1].role !== "user") return { reply: "Ask me something about the sponsorship campaign.", trace: [], proposals: [] };
  const sess = { proposals: [] as any[], asOfDefault: asOf };
  const started = Date.now();
  const trace: any[] = [];
  if (!KEY()) return offline(history[history.length - 1].content, asOf, "No LLM API key is configured (set GEMINI_API_KEY).");
  const messages: any[] = [{ role: "system", content: systemPrompt(asOf) }, ...history];
  const state: { model?: string; reasoning: boolean; deadline: number; errors: string[] } = { reasoning: true, deadline: Date.now() + 52000, errors: [] };
  try {
    for (let step = 0; step < 6; step++) {
      const lowOnTime = state.deadline - Date.now() < 15000;
      if (lowOnTime) messages.push({ role: "user", content: "(System: time is nearly up. Answer now from the tool results you already have; do not call more tools.)" });
      const final = step >= 5 || lowOnTime;
      const res = await chatWithFallback(messages, TOOLS, state, final ? "none" : "auto");
      const msg = res.choices?.[0]?.message;
      if (!msg) throw new Error("Empty LLM response");
      const calls = msg.tool_calls || [];
      if (!calls.length) return { reply: (msg.content || "").trim() || "(no answer)", trace, proposals: sess.proposals, model: state.model, as_of: asOf, ms: Date.now() - started };
      calls.forEach((c: any, i: number) => { if (!c.id) c.id = `call_${step}_${i}`; });
      messages.push({ ...msg, content: msg.content ?? "", tool_calls: calls });
      for (const c of calls) {
        const t0 = Date.now(); let args: any = {}; let result: any;
        try { args = c.function?.arguments ? JSON.parse(c.function.arguments) : {}; } catch { args = {}; }
        try { result = await execTool(c.function?.name, args, sess); } catch (e: any) { result = { error: e?.message || String(e) }; }
        const json = JSON.stringify(result);
        trace.push({ tool: c.function?.name, args, ms: Date.now() - t0, summary: summarize(c.function?.name, result) });
        messages.push({ role: "tool", tool_call_id: c.id, name: c.function?.name, content: json.length > 30000 ? json.slice(0, 30000) + "…(truncated)" : json });
      }
    }
    return { reply: "I ran out of analysis steps. Try a narrower question.", trace, proposals: sess.proposals, model: state.model, as_of: asOf };
  } catch (e: any) {
    console.error("copilot LLM failure", state.errors);
    const o: any = await offline(history[history.length - 1].content, asOf, `The AI model is unavailable right now (${String(e?.message || e).slice(0, 160)}).`);
    o.trace = [...trace, ...o.trace]; o.proposals = [...sess.proposals, ...(o.proposals || [])];
    return o;
  }
}

/** Fallback when the LLM is unavailable: computed diagnostics from live data, clearly labelled (no free-form answers). */
async function offline(question: string, asOf: string | null, reason: string) {
  const ctx = await A.resolveCtx(asOf);
  const [o, b] = await Promise.all([A.overview(ctx), A.bottlenecks(ctx)]);
  const L = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
  const lines = [`**AI analyst offline** - ${reason} Showing computed diagnostics for ${ctx.label} instead of an answer to: "${question.slice(0, 120)}".`, "",
    `- Confirmed partnerships: **${o.confirmedCount}** vs goal ${o.target?.confirmed_partnerships_goal ?? "n/a"} (${o.target?.target_version || "no target"}); value ${L(o.confirmedValue)} (cash ${L(o.cashConfirmedValue)}, in-kind ${L(o.inKindConfirmedValue)})`,
    `- Qualified brands: **${o.qualified}** vs goal ${o.target?.qualified_brands_goal ?? "n/a"}`,
    `- Cash received (recorded payments): ${L(o.cashReceived)} - confirmed value is not proof of receipt`,
    `- Open pipeline: ${o.openCount} deals, ${L(o.openValue)}; projected at event: ${o.forecast.projectedConfirmedCount} deals`, "", "**Findings**",
    ...b.findings.filter((f: any) => f.type !== "channel_summary").slice(0, 6).map((f: any) => `- ${f.title}: ${f.evidence}`)];
  return { reply: lines.join("\n"), trace: [{ tool: "offline_diagnostics", args: { asOf }, ms: 0, summary: "computed without LLM" }], proposals: [], model: null, as_of: asOf, offline: true };
}

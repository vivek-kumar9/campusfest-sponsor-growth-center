import seed from "@/data/seed.json";
import { SCHEMA_SQL } from "./schema";
import type { Adapter } from "./db";

const S: any = seed;
export const SEED_VERSION = "2026-11-27.1";

function channelGroup(channel: string) {
  if (channel === "introduction") return "warm";
  if (channel === "web_inbound") return "inbound";
  return "cold";
}

function dedupe(rows: any[], key: string) {
  const seen = new Map<string, string>();
  const out: any[] = [];
  let exact = 0, conflicting = 0;
  for (const r of rows) {
    const id = r[key];
    const sig = JSON.stringify(r);
    if (seen.has(id)) { if (seen.get(id) === sig) exact++; else conflicting++; continue; }
    seen.set(id, sig); out.push(r);
  }
  return { rows: out, exact, conflicting };
}

async function insertMany(q: (t: string, p?: any[]) => Promise<any[]>, table: string, cols: string[], rows: any[]) {
  const size = Math.max(1, Math.floor(2000 / cols.length));
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const params: any[] = [];
    const values = chunk.map((r) => "(" + cols.map((c) => { params.push(r[c] ?? null); return `$${params.length}`; }).join(",") + ")").join(",");
    await q(`insert into ${table} (${cols.join(",")}) values ${values} on conflict do nothing`, params);
  }
}

export const DEFAULT_ASSUMPTIONS: [string, string, number, string, string, string][] = [
  // key, label, value, unit, source_tag, note
  ["renew_pool", "2025 cash partners eligible for renewal", 20, "brands", "dataset", "20 confirmed cash partnerships in the 2025 data"],
  ["renew_rate_base", "Renewal rate - base", 0.40, "ratio", "assumption", "No renewal history in data; conservative"],
  ["renew_rate_stretch", "Renewal rate - stretch (ROI proof pack + early-bird)", 0.65, "ratio", "assumption", "Requires proof-of-value report"],
  ["renew_deal_base", "Avg renewal deal - base", 100000, "INR", "dataset", "2025 average cash deal = ₹1,00,000"],
  ["renew_deal_stretch", "Avg renewal deal - stretch (+10% bundle uplift)", 110000, "INR", "assumption", ""],
  ["warm_intros_base", "Warm intros - base", 30, "intros", "dataset", "2025: 21 creator + 9 partner introductions"],
  ["warm_intros_stretch", "Warm intros - stretch (alumni + partner referral asks)", 60, "intros", "assumption", ""],
  ["warm_conv_base", "Warm intro -> cash deal - base", 0.4667, "ratio", "dataset", "2025: 14 cash deals from 30 intros"],
  ["warm_conv_stretch", "Warm intro -> cash deal - stretch (quality haircut)", 0.40, "ratio", "assumption", "Marginal intros convert worse"],
  ["warm_deal", "Avg warm cash deal", 97500, "INR", "dataset", "2025 warm-intro cash deals"],
  ["inbound_base", "Inbound form submissions - base", 18, "brands", "dataset", "2025 partner-form submissions"],
  ["inbound_stretch", "Inbound submissions - stretch (sponsor page + LinkedIn)", 30, "brands", "assumption", ""],
  ["inbound_conv", "Inbound -> cash deal", 0.3333, "ratio", "dataset", "2025: 6 cash deals from 18 submissions"],
  ["inbound_deal", "Avg inbound cash deal", 105833, "INR", "dataset", "2025 inbound cash deals"],
  ["cold_qualified", "Cold brands reaching qualification", 30, "brands", "assumption", "2025: 24 cold-sourced brands qualified"],
  ["cold_conv_base", "Cold qualified -> cash deal - base", 0, "ratio", "dataset", "2025: 0 of 33 cold opportunities confirmed"],
  ["cold_conv_stretch", "Cold qualified -> cash deal - stretch (qualify-first, entry package)", 0.10, "ratio", "assumption", "Stop if below 5% after 10 proposals"],
  ["cold_deal", "Cold entry package", 55000, "INR", "assumption", "Matches 2025 proposal_sent price point"],
  ["coll_std_renew", "Collected before fest - renewals, standard terms", 0.80, "ratio", "assumption", "Payment-lag curve applied to ~50 days lead time"],
  ["coll_std_warm", "Collected before fest - warm, standard terms", 0.581, "ratio", "dataset+benchmark", "2025 confirmation dates x payment-lag curve"],
  ["coll_std_inbound", "Collected before fest - inbound, standard terms", 0.469, "ratio", "dataset+benchmark", "2025 confirmation dates x payment-lag curve"],
  ["coll_adv_renew", "Collected before fest - renewals, advance terms", 0.933, "ratio", "assumption", "50% advance in 7 days + balance due D-7"],
  ["coll_adv_warm", "Collected before fest - warm, advance terms + 3 weeks earlier", 0.907, "ratio", "assumption", ""],
  ["coll_adv_inbound", "Collected before fest - inbound, advance terms + 3 weeks earlier", 0.887, "ratio", "assumption", ""],
  ["coll_adv_cold", "Collected before fest - cold, advance terms", 0.804, "ratio", "assumption", ""],
  ["growth_budget_cap", "Growth budget cap (all five bets)", 250000, "INR", "assumption", ""],
  ["team_capacity_weeks", "Team capacity for bets (person-weeks)", 20, "person-weeks", "assumption", "4 people x 16 weeks, ~30% on bets"],
];

const INITIATIVES = [
  { initiative_id: "I1", rank: 1, name: "Advance-payment terms + earlier close calendar", owner_id: "T03",
    concept: "50% advance due 7 days after signing (tied to print/branding deadlines), balance due D-7, 3% early-bird discount for 100% advance, no new deal after D-21 without advance. Turns confirmed value into cash before the fest.",
    budget_inr: 75000, start_week: 1, end_week: 16, expected_incremental_inr: 816917, confidence: 0.6, effort_weeks: 1.5,
    kpi_key: "cash_collected_share", kpi_label: "Cash received ÷ confirmed cash value", scale_threshold: 0.7, stop_threshold: 0.4,
    threshold_note: "Scale (make default) at ≥70% by week 6; change terms at 40-70%; revert if <40% or win rate drops >10 pts", linked_campaign_ids: "" },
  { initiative_id: "I2", rank: 2, name: "Renewal-first program with ROI proof pack", owner_id: "T01",
    concept: "Week-1 outreach to every 2025 cash partner with an impact report (reach, sampling, leads) and an early-bird renewal price lock plus a bundle upgrade.",
    budget_inr: 25000, start_week: 1, end_week: 6, expected_incremental_inr: 588000, confidence: 0.6, effort_weeks: 3,
    kpi_key: "renewal_win_rate", kpi_label: "Renewal opportunities confirmed ÷ renewal opportunities", scale_threshold: 0.5, stop_threshold: 0.3,
    threshold_note: "Scale (add upsell tier) at ≥50% by week 6; change offer at 30-50%; stop special pricing below 30%", linked_campaign_ids: "" },
  { initiative_id: "I3", rank: 3, name: "Warm-intro engine (alumni + partner referrals + creators)", owner_id: "T05",
    concept: "Double warm introductions: structured alumni asks (marketing/brand roles in NCR), a referral ask at every signing, and more creator partners. 2025 warm intros converted to cash 47% of the time vs 0% for cold.",
    budget_inr: 60000, start_week: 2, end_week: 12, expected_incremental_inr: 884250, confidence: 0.7, effort_weeks: 6,
    kpi_key: "warm_intros_per_week", kpi_label: "Warm introductions per week (trailing 14 days)", scale_threshold: 4, stop_threshold: 2,
    threshold_note: "Scale at ≥4/week with intro→meeting ≥70%; change targeting below 70%; stop paid alumni events if <2/week after week 5", linked_campaign_ids: "SC02,SC05" },
  { initiative_id: "I4", rank: 4, name: "Inbound engine: sponsor page + LinkedIn proof posts", owner_id: "T02",
    concept: "Public sponsor page with package tiers and partner logos, LinkedIn posts showing 2025 partner outcomes, small retargeting budget. Inbound converted 33% to cash in 2025.",
    budget_inr: 50000, start_week: 3, end_week: 12, expected_incremental_inr: 375478, confidence: 0.5, effort_weeks: 3,
    kpi_key: "inbound_per_week", kpi_label: "Partner-form submissions per week (trailing 14 days)", scale_threshold: 2.5, stop_threshold: 1,
    threshold_note: "Scale ads at ≥2.5/week and cost per qualified inbound ≤₹5k; stop ads if <1/week after ₹15k spend", linked_campaign_ids: "SC04" },
  { initiative_id: "I5", rank: 5, name: "Cold reset: qualify-first + ₹55k entry package", owner_id: "T02",
    concept: "Stop mass email. Only open an opportunity after a discovery meeting confirms fit; lead with a ₹55k entry package; ask confirmed partners to warm up cold accounts. 2025 cold outreach: 322 touches, 33 opportunities, 0 confirmed.",
    budget_inr: 10000, start_week: 1, end_week: 8, expected_incremental_inr: 132688, confidence: 0.3, effort_weeks: 3,
    kpi_key: "cold_proposal_win_rate", kpi_label: "Cold opportunities confirmed ÷ cold opportunities past proposal", scale_threshold: 0.15, stop_threshold: 0.05,
    threshold_note: "Keep only if ≥15% after 10 proposals; stop cold proposals below 5% and move the owner to warm/renewals", linked_campaign_ids: "SC01,SC03,SC06" },
];

function istNow() { return new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 19).replace("T", " "); }
function istDate(offsetDays = 0) { return new Date(Date.now() + 5.5 * 3600e3 + offsetDays * 864e5).toISOString().slice(0, 10); }

const DEMO_TASKS = [
  ["Send ROI proof pack + early-bird renewal offer to all 2025 cash partners", "T01", 3, "todo", "high", "initiative", "I2", "I2"],
  ["Draft advance-payment clause and invoice template for all new contracts", "T03", 2, "in_progress", "high", "initiative", "I1", "I1"],
  ["Build alumni intro list (brand/marketing roles in Delhi NCR) and send first 50 asks", "T05", 5, "todo", "high", "initiative", "I3", "I3"],
  ["Publish sponsor page with package tiers and 2025 partner outcomes", "T02", 7, "todo", "medium", "initiative", "I4", "I4"],
  ["Pause Brand Discovery Email blasts; only email brands with a confirmed fit", "T02", 1, "todo", "high", "campaign", "SC01", "I5"],
  ["Follow up Evergreen Living - negotiating with no stage change since 6 Feb", "T05", 1, "todo", "medium", "opportunity", "O053", ""],
];

export async function seedAll(a: Adapter) {
  await a.tx(async (q) => {
    // serialise concurrent cold starts: only one instance seeds
    await q(`select pg_advisory_xact_lock(424242)`);
    if ((await q(`select 1 from meta where key='seed_version'`)).length) return;
    const log: any[] = [];
    const load = async (table: string, key: string, rows: any[], cols: string[], map?: (r: any) => any) => {
      const d = dedupe(rows, key);
      const mapped = map ? d.rows.map(map) : d.rows;
      await insertMany(q, table, cols, mapped);
      log.push([table, rows.length, d.rows.length, d.exact, d.conflicting]);
    };
    const e = S.event[0];
    await q(`insert into event (id,event_name,history_start,history_end,event_starts_at,event_ends_at,timezone,currency) values (1,$1,$2,$3,$4,$5,$6,$7) on conflict do nothing`,
      [e.event_name, e.history_start.slice(0, 10), e.history_end.slice(0, 10), e.event_starts_at, e.event_ends_at, e.timezone, e.currency]);
    await insertMany(q, "team", ["owner_id", "owner_name", "role"], S.team.map((t: any) => ({ ...t, role: "Sponsorship team" })));
    for (const t of S.targets) await q(`insert into targets (effective_at,qualified_brands_goal,confirmed_partnerships_goal,cash_goal_inr,target_version,source) values ($1,$2,$3,null,$4,'dataset')`,
      [t.effective_at, t.qualified_brands_goal, t.confirmed_partnerships_goal, t.target_version]);
    await load("brands", "brand_id", S.brands, ["brand_id", "brand_name", "industry", "owner_id", "owner_name", "created_at"]);
    await load("contacts", "contact_id", S.contacts, ["contact_id", "contact_name", "job_title", "brand_id", "created_at"]);
    await load("campaigns", "campaign_id", S.campaigns, ["campaign_id", "campaign_name", "channel", "channel_group", "objective", "audience", "owner_id", "owner_name", "planned_start_at", "planned_end_at", "created_at"],
      (r) => ({ ...r, channel_group: channelGroup(r.channel) }));
    await load("interactions", "interaction_id", S.interactions, ["interaction_id", "attempt_id", "origin_interaction_id", "brand_id", "contact_id", "campaign_id", "owner_id", "channel", "event_type", "outcome", "summary", "occurred_at"]);
    await load("qualification_history", "history_id", S.qualification, ["history_id", "brand_id", "campaign_id", "qualification_status", "reason", "effective_at"]);
    await load("opportunities", "opportunity_id", S.opportunities, ["opportunity_id", "opportunity_name", "brand_id", "primary_contact_id", "campaign_id", "support_type", "created_at"]);
    await load("opportunity_history", "history_id", S.opportunity_history, ["history_id", "opportunity_id", "brand_id", "stage", "proposed_value_inr", "confirmed_value_inr", "owner_id", "owner_name", "effective_at"]);
    await load("activations", "activation_id", S.activations, ["activation_id", "brand_id", "opportunity_id", "attendee_campaign_id", "attendee_campaign_name", "activation_note", "linked_at"]);
    for (const l of log) await q(`insert into import_log values ($1,$2,$3,$4,$5) on conflict (table_name) do update set source_rows=excluded.source_rows, loaded_rows=excluded.loaded_rows, duplicates_skipped=excluded.duplicates_skipped, conflicting_duplicates=excluded.conflicting_duplicates`, l);
    let i = 0;
    for (const [key, label, value, unit, tag, note] of DEFAULT_ASSUMPTIONS) await q(`insert into assumptions values ($1,$2,$3,$4,$5,$6,$7) on conflict do nothing`, [key, label, value, unit, tag, note, i++]);
    const now = istNow();
    for (const it of INITIATIVES) {
      const cols = Object.keys(it);
      await q(`insert into initiatives (${cols.join(",")},status,decision,updated_at) values (${cols.map((_, j) => "$" + (j + 1)).join(",")},'active','Run as planned',$${cols.length + 1}) on conflict do nothing`, [...cols.map((c) => (it as any)[c]), now]);
    }
    let n = 1;
    for (const [title, owner, due, status, prio, rtype, rid, init] of DEMO_TASKS) {
      await q(`insert into tasks (task_id,title,owner_id,due_date,status,priority,related_type,related_id,initiative_id,created_by,source,created_at,updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'seed','simulated',$10,$10) on conflict do nothing`,
        [`TK${String(n++).padStart(3, "0")}`, title, owner, istDate(due as number), status, prio, rtype, rid, init || null, now]);
    }
    await q(`insert into meta values ('seed_version',$1),('seeded_at',$2) on conflict (key) do update set value=excluded.value`, [SEED_VERSION, now]);
  });
}

const RESET_TABLES = ["event", "team", "targets", "brands", "contacts", "campaigns", "interactions", "qualification_history", "opportunities", "opportunity_history", "activations", "payments", "initiatives", "tasks", "assumptions", "pending_actions", "import_log", "meta"];

export async function resetAll(a: Adapter) {
  await a.exec(`truncate ${RESET_TABLES.join(", ")} restart identity`);
  await seedAll(a);
  await a.query(`insert into audit_log (at,actor,action,entity_type,entity_id,detail) values ($1,'user','reset','database','all','Restored original dataset and default plan')`, [istNow()]);
}

export async function ensureSchemaAndSeed(a: Adapter) {
  await a.exec(`select pg_advisory_xact_lock(424241);\n` + SCHEMA_SQL);
  const r = await a.query(`select value from meta where key='seed_version'`);
  if (!r.length) await seedAll(a);
}
export { istNow, istDate };

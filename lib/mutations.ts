import { getDb, q, q1 } from "./db";
import { resolveCtx, OPEN_STAGES } from "./analytics";
import { istNow } from "./seed";

export class UserError extends Error { status = 400; }
const STAGES = [...OPEN_STAGES, "partner_confirmed", "lost", "withdrawn"];
const QUAL = ["unreviewed", "engaged", "qualified", "unqualified", "dormant"];
const TASK_STATUS = ["todo", "in_progress", "blocked", "done"];
const uid = (p: string) => `${p}${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

async function audit(action: string, type: string, id: string, detail: any, actor = "user") {
  await q(`insert into audit_log (at,actor,action,entity_type,entity_id,detail) values ($1,$2,$3,$4,$5,$6)`, [istNow(), actor, action, type, id, typeof detail === "string" ? detail : JSON.stringify(detail)]);
}

/** Timestamp for a new source-style record: end of the viewed as-of day, or 1 minute after the latest activity ("campaign clock"). */
export async function campaignNow(asOf?: string | null, explicit?: string | null) {
  if (explicit && /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/.test(explicit)) {
    const s = explicit.replace("T", " "); return s.length === 10 ? s + " 12:00:00" : s.length === 16 ? s + ":00" : s;
  }
  const ctx = await resolveCtx(asOf);
  if (ctx.asOf) return `${ctx.asOf} 23:59:00`;
  const d = new Date(Date.parse(ctx.ref.replace(" ", "T") + "Z") + 60e3);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

async function resolveOwner(input: any) {
  if (!input) return null;
  const r = await q1(`select owner_id, owner_name from team where owner_id=$1 or lower(owner_name)=lower($1) or lower(split_part(owner_name,' ',1))=lower($1) limit 1`, [String(input)]);
  if (!r) throw new UserError(`Unknown owner '${input}'. Team: ${(await q(`select owner_name from team`)).map((x: any) => x.owner_name).join(", ")}`);
  return r;
}

export async function updateOpportunityStage(id: string, body: any, actor = "user") {
  const opp = await q1(`select * from opportunities where opportunity_id=$1 or lower(opportunity_name)=lower($1)`, [id]);
  if (!opp) throw new UserError(`Opportunity '${id}' not found`);
  const cur = await q1(`select * from opp_state_asof('9999-12-31') where opportunity_id=$1`, [opp.opportunity_id]);
  const stage = body.stage || cur?.stage;
  if (!STAGES.includes(stage)) throw new UserError(`Invalid stage '${stage}'. Use one of ${STAGES.join(", ")}`);
  const proposed = body.proposed_value_inr !== undefined && body.proposed_value_inr !== null && body.proposed_value_inr !== "" ? Math.round(Number(body.proposed_value_inr)) : cur?.proposed_value_inr ?? 0;
  if (!isFinite(proposed) || proposed < 0) throw new UserError("proposed_value_inr must be a non-negative number");
  const confirmed = stage === "partner_confirmed" ? (body.confirmed_value_inr ? Math.round(Number(body.confirmed_value_inr)) : proposed) : 0;
  const owner = body.owner ? await resolveOwner(body.owner) : { owner_id: cur?.owner_id, owner_name: cur?.owner_name };
  const at = await campaignNow(body.asOf, body.effective_at);
  const hid = uid("OHU");
  await q(`insert into opportunity_history (history_id,opportunity_id,brand_id,stage,proposed_value_inr,confirmed_value_inr,owner_id,owner_name,effective_at,note,source) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'app')`,
    [hid, opp.opportunity_id, opp.brand_id, stage, proposed, confirmed, owner?.owner_id, owner?.owner_name, at, body.note || null]);
  await audit("stage_change", "opportunity", opp.opportunity_id, { from: cur?.stage, to: stage, proposed, confirmed, effective_at: at }, actor);
  return { history_id: hid, opportunity_id: opp.opportunity_id, from: cur?.stage, to: stage, proposed_value_inr: proposed, confirmed_value_inr: confirmed, effective_at: at };
}

export async function createOpportunity(body: any, actor = "user") {
  const brand = await q1(`select * from brands where brand_id=$1 or lower(brand_name)=lower($1)`, [body.brand || body.brand_id || ""]);
  if (!brand) throw new UserError(`Brand '${body.brand || body.brand_id}' not found (create the brand first)`);
  const camp = body.campaign_id || body.campaign ? await q1(`select campaign_id from campaigns where campaign_id=$1 or lower(campaign_name)=lower($1)`, [body.campaign_id || body.campaign]) : null;
  const next = await q1(`select 'O' || lpad((coalesce(max(nullif(regexp_replace(opportunity_id,'\\D','','g'),'')::int),0)+1)::text,3,'0') as id from opportunities`);
  const at = await campaignNow(body.asOf, body.effective_at);
  const owner = await resolveOwner(body.owner || brand.owner_id);
  const support = body.support_type === "in_kind" ? "in_kind" : "cash";
  const deal = body.deal_type === "renewal" ? "renewal" : "new";
  const name = body.opportunity_name || `${brand.brand_name} ${deal === "renewal" ? "renewal" : "festival partnership"}`;
  const value = Math.max(0, Math.round(Number(body.proposed_value_inr || 0)));
  await q(`insert into opportunities (opportunity_id,opportunity_name,brand_id,primary_contact_id,campaign_id,support_type,deal_type,created_at,source) values ($1,$2,$3,$4,$5,$6,$7,$8,'app')`,
    [next.id, name, brand.brand_id, body.primary_contact_id || null, camp?.campaign_id || null, support, deal, at]);
  await q(`insert into opportunity_history (history_id,opportunity_id,brand_id,stage,proposed_value_inr,confirmed_value_inr,owner_id,owner_name,effective_at,source) values ($1,$2,$3,$4,$5,0,$6,$7,$8,'app')`,
    [uid("OHU"), next.id, brand.brand_id, body.stage && STAGES.includes(body.stage) && body.stage !== "partner_confirmed" ? body.stage : "prospecting", value, owner?.owner_id, owner?.owner_name, at]);
  await audit("create", "opportunity", next.id, { name, value, deal_type: deal, support_type: support }, actor);
  return { opportunity_id: next.id, opportunity_name: name, created_at: at };
}

export async function createBrand(body: any, actor = "user") {
  if (!body.brand_name) throw new UserError("brand_name is required");
  const next = await q1(`select 'A' || lpad((coalesce(max(nullif(regexp_replace(brand_id,'\\D','','g'),'')::int),0)+1)::text,3,'0') as id from brands`);
  const owner = await resolveOwner(body.owner || "T02");
  const at = await campaignNow(body.asOf, body.effective_at);
  await q(`insert into brands (brand_id,brand_name,industry,owner_id,owner_name,created_at,source) values ($1,$2,$3,$4,$5,$6,'app')`, [next.id, body.brand_name, body.industry || null, owner.owner_id, owner.owner_name, at]);
  await q(`insert into qualification_history (history_id,brand_id,campaign_id,qualification_status,reason,effective_at,source) values ($1,$2,$3,'unreviewed','Brand added in the app; fit not yet assessed.',$4,'app')`, [uid("BQU"), next.id, body.campaign_id || null, at]);
  if (body.contact_name) await q(`insert into contacts (contact_id,contact_name,job_title,brand_id,created_at,source) values ($1,$2,$3,$4,$5,'app')`, [uid("SCONU"), body.contact_name, body.job_title || null, next.id, at]);
  await audit("create", "brand", next.id, body, actor);
  return { brand_id: next.id, created_at: at };
}

export async function setQualification(brandId: string, body: any, actor = "user") {
  const brand = await q1(`select * from brands where brand_id=$1 or lower(brand_name)=lower($1)`, [brandId]);
  if (!brand) throw new UserError(`Brand '${brandId}' not found`);
  if (!QUAL.includes(body.status)) throw new UserError(`status must be one of ${QUAL.join(", ")}`);
  const prev = await q1(`select * from brand_qual_asof('9999-12-31') where brand_id=$1`, [brand.brand_id]);
  const at = await campaignNow(body.asOf, body.effective_at);
  const id = uid("BQU");
  await q(`insert into qualification_history (history_id,brand_id,campaign_id,qualification_status,reason,effective_at,source) values ($1,$2,$3,$4,$5,$6,'app')`,
    [id, brand.brand_id, body.campaign_id || prev?.campaign_id || null, body.status, body.reason || "Updated in the app", at]);
  await audit("qualification", "brand", brand.brand_id, { from: prev?.qualification_status, to: body.status, effective_at: at }, actor);
  return { history_id: id, brand_id: brand.brand_id, from: prev?.qualification_status, to: body.status, effective_at: at };
}

const EVENT_OUTCOME: Record<string, string> = { outreach_sent: "sent", delivered: "delivered", meeting_booked: "scheduled", meeting_held: "attended", opt_out: "do_not_contact", introduction_received: "introduced", web_inbound: "interest_submitted" };
export async function logInteraction(body: any, actor = "user") {
  const brand = await q1(`select * from brands where brand_id=$1 or lower(brand_name)=lower($1)`, [body.brand || body.brand_id || ""]);
  if (!brand) throw new UserError("Brand not found");
  const camp = await q1(`select * from campaigns where campaign_id=$1 or lower(campaign_name)=lower($1)`, [body.campaign_id || body.campaign || ""]);
  if (!camp) throw new UserError("Campaign not found");
  const et = body.event_type;
  if (!["outreach_sent", "delivered", "replied", "meeting_booked", "meeting_held", "opt_out", "introduction_received", "web_inbound"].includes(et)) throw new UserError("Invalid event_type");
  const outcome = et === "replied" ? (["positive", "neutral", "not_interested", "wrong_contact"].includes(body.outcome) ? body.outcome : "neutral") : EVENT_OUTCOME[et];
  const contact = body.contact_id ? { contact_id: body.contact_id } : await q1(`select contact_id from contacts where brand_id=$1 order by contact_id limit 1`, [brand.brand_id]);
  const root = ["outreach_sent", "introduction_received", "web_inbound"].includes(et);
  let origin = null, attempt = uid("SAU");
  if (!root) {
    const r = await q1(`select interaction_id, attempt_id from interactions where brand_id=$1 and campaign_id=$2 and origin_interaction_id is null order by occurred_at desc limit 1`, [brand.brand_id, camp.campaign_id]);
    if (r) { origin = r.interaction_id; attempt = r.attempt_id; }
  }
  const at = await campaignNow(body.asOf, body.occurred_at || body.effective_at);
  const id = uid("SIU");
  await q(`insert into interactions (interaction_id,attempt_id,origin_interaction_id,brand_id,contact_id,campaign_id,owner_id,channel,event_type,outcome,summary,occurred_at,source) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'app')`,
    [id, attempt, origin, brand.brand_id, contact?.contact_id || null, camp.campaign_id, camp.owner_id, camp.channel, et, outcome, body.summary || "Logged in the app", at]);
  await audit("log", "interaction", id, { brand: brand.brand_name, campaign: camp.campaign_name, event_type: et, outcome, occurred_at: at }, actor);
  return { interaction_id: id, occurred_at: at };
}

export async function updateCampaign(id: string, body: any, actor = "user") {
  const c = await q1(`select * from campaigns where campaign_id=$1 or lower(campaign_name)=lower($1)`, [id]);
  if (!c) throw new UserError(`Campaign '${id}' not found`);
  const status = body.status ?? c.status;
  if (!["active", "paused", "stopped", "scaling"].includes(status)) throw new UserError("status must be active, paused, stopped or scaling");
  const owner = body.owner ? await resolveOwner(body.owner) : { owner_id: c.owner_id, owner_name: c.owner_name };
  const num = (v: any, d: any) => (v === undefined ? d : v === null || v === "" ? null : Math.round(Number(v)));
  await q(`update campaigns set status=$2, budget_inr=$3, spent_inr=$4, notes=$5, owner_id=$6, owner_name=$7 where campaign_id=$1`,
    [c.campaign_id, status, num(body.budget_inr, c.budget_inr), num(body.spent_inr, c.spent_inr), body.notes ?? c.notes, owner.owner_id, owner.owner_name]);
  await audit("update", "campaign", c.campaign_id, body, actor);
  return { campaign_id: c.campaign_id, status };
}

export async function createTask(body: any, actor = "user") {
  if (!body.title) throw new UserError("title is required");
  const owner = body.owner || body.owner_id ? await resolveOwner(body.owner || body.owner_id) : null;
  const due = body.due_date && /^\d{4}-\d{2}-\d{2}$/.test(body.due_date) ? body.due_date : null;
  const id = uid("TK");
  const now = istNow();
  await q(`insert into tasks (task_id,title,description,owner_id,due_date,status,priority,related_type,related_id,initiative_id,created_by,source,created_at,updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'app',$12,$12)`,
    [id, String(body.title).slice(0, 200), body.description || null, owner?.owner_id || null, due, TASK_STATUS.includes(body.status) ? body.status : "todo", ["low", "medium", "high"].includes(body.priority) ? body.priority : "medium",
      body.related_type || null, body.related_id || null, body.initiative_id || null, actor, now]);
  await audit("create", "task", id, { title: body.title, owner: owner?.owner_name, due }, actor);
  return { task_id: id, title: body.title, owner: owner?.owner_name || null, due_date: due };
}

export async function updateTask(id: string, body: any, actor = "user") {
  const t = await q1(`select * from tasks where task_id=$1`, [id]);
  if (!t) throw new UserError(`Task '${id}' not found`);
  if (body.status && !TASK_STATUS.includes(body.status)) throw new UserError(`status must be one of ${TASK_STATUS.join(", ")}`);
  const owner = body.owner ? await resolveOwner(body.owner) : null;
  await q(`update tasks set title=$2, description=$3, owner_id=$4, due_date=$5, status=$6, priority=$7, updated_at=$8 where task_id=$1`,
    [id, body.title ?? t.title, body.description ?? t.description, owner ? owner.owner_id : t.owner_id, body.due_date ?? t.due_date, body.status ?? t.status, body.priority ?? t.priority, istNow()]);
  await audit("update", "task", id, body, actor);
  return { task_id: id, ...body };
}

export async function deleteTask(id: string, actor = "user") {
  await q(`delete from tasks where task_id=$1`, [id]); await audit("delete", "task", id, "", actor); return { deleted: id };
}

export async function recordPayment(body: any, actor = "user") {
  const opp = await q1(`select o.*, s.stage, s.confirmed_value_inr from opportunities o join opp_state_asof('9999-12-31') s using (opportunity_id) where o.opportunity_id=$1 or lower(o.opportunity_name)=lower($1)`, [body.opportunity_id || body.opportunity || ""]);
  if (!opp) throw new UserError("Opportunity not found");
  const amt = Math.round(Number(body.amount_inr));
  if (!isFinite(amt) || amt <= 0) throw new UserError("amount_inr must be positive");
  const paid = await q1(`select coalesce(sum(amount_inr),0)::int as s from payments where opportunity_id=$1 and status='received'`, [opp.opportunity_id]);
  const warn = opp.stage !== "partner_confirmed" ? `Opportunity stage is '${opp.stage}', not partner_confirmed.` : paid.s + amt > opp.confirmed_value_inr ? `Payments would exceed confirmed value (₹${opp.confirmed_value_inr}).` : null;
  const at = await campaignNow(body.asOf, body.received_at);
  const id = uid("PAY");
  await q(`insert into payments (payment_id,opportunity_id,amount_inr,status,invoiced_at,received_at,note,created_at) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, opp.opportunity_id, amt, body.status === "invoiced" ? "invoiced" : "received", body.invoiced_at || null, body.status === "invoiced" ? null : at, body.note || null, istNow()]);
  await audit("payment", "opportunity", opp.opportunity_id, { amount: amt, received_at: at }, actor);
  return { payment_id: id, opportunity_id: opp.opportunity_id, amount_inr: amt, received_at: at, warning: warn };
}

export async function addTarget(body: any, actor = "user") {
  const at = await campaignNow(body.asOf, body.effective_at);
  const cur = await q1(`select * from target_asof('9999-12-31')`);
  const n = (v: any, d: any) => (v === undefined || v === null || v === "" ? d : Math.round(Number(v)));
  await q(`insert into targets (effective_at,qualified_brands_goal,confirmed_partnerships_goal,cash_goal_inr,target_version,source) values ($1,$2,$3,$4,$5,'app')`,
    [at, n(body.qualified_brands_goal, cur?.qualified_brands_goal), n(body.confirmed_partnerships_goal, cur?.confirmed_partnerships_goal), n(body.cash_goal_inr, cur?.cash_goal_inr), body.target_version || "App target update"]);
  await audit("create", "target", at, body, actor);
  return { effective_at: at };
}

export async function updateInitiative(id: string, body: any, actor = "user") {
  const it = await q1(`select * from initiatives where initiative_id=$1 or lower(name)=lower($1)`, [id]);
  if (!it) throw new UserError(`Initiative '${id}' not found`);
  const owner = body.owner ? await resolveOwner(body.owner) : null;
  const num = (v: any, d: any) => (v === undefined || v === null || v === "" ? d : Number(v));
  await q(`update initiatives set status=$2, decision=$3, budget_inr=$4, spent_inr=$5, owner_id=$6, scale_threshold=$7, stop_threshold=$8, updated_at=$9 where initiative_id=$1`,
    [it.initiative_id, body.status ?? it.status, body.decision ?? it.decision, num(body.budget_inr, it.budget_inr), num(body.spent_inr, it.spent_inr), owner ? owner.owner_id : it.owner_id, num(body.scale_threshold, it.scale_threshold), num(body.stop_threshold, it.stop_threshold), istNow()]);
  await audit("update", "initiative", it.initiative_id, body, actor);
  return { initiative_id: it.initiative_id, ...body };
}

export async function updateAssumption(key: string, value: any, actor = "user") {
  const v = Number(value);
  if (!isFinite(v)) throw new UserError("value must be a number");
  const r = await q1(`update assumptions set value=$2 where key=$1 returning key`, [key, v]);
  if (!r) throw new UserError(`Unknown assumption '${key}'`);
  await audit("update", "assumption", key, { value: v }, actor);
  return { key, value: v };
}

/** Execute a confirmed copilot proposal. */
export async function executeAction(type: string, p: any) {
  switch (type) {
    case "create_task": return createTask(p, "copilot (confirmed)");
    case "update_task": return updateTask(p.task_id, p, "copilot (confirmed)");
    case "update_campaign": return updateCampaign(p.campaign_id || p.campaign, p, "copilot (confirmed)");
    case "update_opportunity_stage": return updateOpportunityStage(p.opportunity_id || p.opportunity, p, "copilot (confirmed)");
    case "update_initiative": return updateInitiative(p.initiative_id, p, "copilot (confirmed)");
    case "record_payment": return recordPayment(p, "copilot (confirmed)");
    default: throw new UserError(`Unsupported action ${type}`);
  }
}

export async function resolvePendingAction(id: string, decision: "confirm" | "reject", edits?: any) {
  const a = await q1(`select * from pending_actions where action_id=$1`, [id]);
  if (!a) throw new UserError("Action not found");
  if (a.status !== "pending") throw new UserError(`Action already ${a.status}`);
  if (decision === "reject") { await q(`update pending_actions set status='rejected', resolved_at=$2 where action_id=$1`, [id, istNow()]); return { status: "rejected" }; }
  const payload = { ...(typeof a.payload === "string" ? JSON.parse(a.payload) : a.payload), ...(edits || {}) };
  const result = await executeAction(a.action_type, payload);
  await q(`update pending_actions set status='confirmed', resolved_at=$2, result=$3 where action_id=$1`, [id, istNow(), JSON.stringify(result)]);
  return { status: "confirmed", result };
}
export { getDb };

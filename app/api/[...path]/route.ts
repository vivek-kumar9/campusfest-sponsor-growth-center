import { NextRequest, NextResponse } from "next/server";
import { getDb, q, q1 } from "@/lib/db";
import * as A from "@/lib/analytics";
import * as M from "@/lib/mutations";
import { resetAll } from "@/lib/seed";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type H = (req: NextRequest, parts: string[], body: any) => Promise<any>;
const asOf = (req: NextRequest) => req.nextUrl.searchParams.get("asOf") || null;

const GET_T: Record<string, H> = {
  async "llm-check"() { const { llmCheck } = await import("@/lib/copilot"); return llmCheck(); },
  async health() { const db = await getDb(); const m = await q(`select * from meta`); return { ok: true, db: db.mode, persistent: db.mode === "postgres" || !process.env.VERCEL, meta: m, llm: !!(process.env.GEMINI_API_KEY || process.env.LLM_API_KEY) }; },
  async overview(req) { return A.overview(await A.resolveCtx(asOf(req))); },
  async funnel(req) { return A.funnel(await A.resolveCtx(asOf(req)), req.nextUrl.searchParams.get("groupBy") || "none"); },
  async campaigns(req) { return A.campaignPerformance(await A.resolveCtx(asOf(req))); },
  async owners(req) { return A.ownerPerformance(await A.resolveCtx(asOf(req))); },
  async trend(req) { return A.trend(await A.resolveCtx(asOf(req))); },
  async diagnose(req) { const ctx = await A.resolveCtx(asOf(req)); const [b, o, s] = await Promise.all([A.bottlenecks(ctx), A.ownerPerformance(ctx), A.stalledDeals(ctx, Number(req.nextUrl.searchParams.get("minDays") || 10))]); return { ...b, owners: o, stalled: s }; },
  async initiatives(req) { return A.initiativeStatus(await A.resolveCtx(asOf(req))); },
  async model(req) { const o = req.nextUrl.searchParams.get("overrides"); return A.growthModel(o ? JSON.parse(o) : {}); },
  async coverage() { return A.dataCoverage(); },
  async team() { return q(`select * from team order by owner_id`); },
  async event() { return A.getEvent(); },
  async targets() { return q(`select target_id, effective_at::text, qualified_brands_goal, confirmed_partnerships_goal, cash_goal_inr, target_version, source from targets order by effective_at`); },
  async opportunities(req, parts) {
    const ctx = await A.resolveCtx(asOf(req));
    if (parts[1]) {
      const o = await q1(`select * from v_opportunities where opportunity_id=$1`, [parts[1]]);
      if (!o) throw new M.UserError("Not found");
      const history = await q(`select history_id, stage, proposed_value_inr, confirmed_value_inr, owner_name, effective_at::text, note, source from opportunity_history where opportunity_id=$1 order by effective_at, history_id`, [parts[1]]);
      const interactions = await q(`select interaction_id, campaign_name, event_type, outcome, summary, contact_name, occurred_at::text, source from v_interactions where brand_id=$1 order by occurred_at`, [o.brand_id]);
      const payments = await q(`select payment_id, amount_inr, status, received_at::text, note from payments where opportunity_id=$1 order by created_at`, [parts[1]]);
      const tasks = await q(`select * from tasks where related_type='opportunity' and related_id=$1 order by created_at`, [parts[1]]);
      const qual = await q(`select qualification_status, reason, effective_at::text, source from qualification_history where brand_id=$1 order by effective_at`, [o.brand_id]);
      return { opportunity: { ...o, created_at: String(o.created_at) }, history, interactions, payments, tasks, qualification: qual };
    }
    return A.oppSnapshot(ctx);
  },
  async brands(req) {
    const ctx = await A.resolveCtx(asOf(req)); const s = (req.nextUrl.searchParams.get("q") || "").toLowerCase();
    return q(`select b.brand_id, b.brand_name, b.industry, b.owner_name, b.created_at::text, b.source, bq.qualification_status, bq.qual_effective_at::text,
        (select count(*)::int from interactions i where i.brand_id=b.brand_id and i.occurred_at < $1) as interactions,
        (select max(occurred_at)::text from interactions i where i.brand_id=b.brand_id and i.occurred_at < $1) as last_touch_at,
        (select count(*)::int from opportunities o where o.brand_id=b.brand_id and o.created_at < $1) as opportunities
      from brands b left join brand_qual_asof($1) bq on bq.brand_id=b.brand_id
      where b.created_at < $1 and ($2 = '' or lower(b.brand_name) like '%' || $2 || '%') order by b.brand_name limit 300`, [ctx.cut, s]);
  },
  async contacts(req) { return q(`select contact_id, contact_name, job_title, brand_id from contacts where brand_id=$1 order by contact_id`, [req.nextUrl.searchParams.get("brand") || ""]); },
  async tasks() { return q(`select k.*, k.due_date::text as due_date, k.created_at::text as created_at, k.updated_at::text as updated_at, t.owner_name from tasks k left join team t on t.owner_id=k.owner_id order by (k.status='done'), k.due_date nulls last, k.created_at`); },
  async payments() { return q(`select p.payment_id, p.opportunity_id, o.opportunity_name, p.amount_inr, p.status, p.received_at::text, p.note, p.created_at::text from payments p left join opportunities o using (opportunity_id) order by p.created_at desc`); },
  async audit() { return q(`select id, at::text, actor, action, entity_type, entity_id, detail from audit_log order by id desc limit 200`); },
  async actions() { return q(`select action_id, action_type, payload, summary, status, created_at::text, resolved_at::text, result from pending_actions order by created_at desc limit 100`); },
};

const POST_T: Record<string, H> = {
  async opportunities(req, parts, body) {
    if (parts[1] && parts[2] === "stage") return M.updateOpportunityStage(parts[1], body);
    return M.createOpportunity(body);
  },
  async brands(req, parts, body) { if (parts[1] && parts[2] === "qualification") return M.setQualification(parts[1], body); return M.createBrand(body); },
  async interactions(req, parts, body) { return M.logInteraction(body); },
  async tasks(req, parts, body) { return M.createTask(body); },
  async payments(req, parts, body) { return M.recordPayment(body); },
  async targets(req, parts, body) { return M.addTarget(body); },
  async actions(req, parts, body) { return M.resolvePendingAction(parts[1], body.decision === "reject" ? "reject" : "confirm", body.edits); },
  async reset() { const db = await getDb(); await resetAll(db); return { ok: true }; },
  async copilot(req, parts, body) { const { runCopilot } = await import("@/lib/copilot"); return runCopilot(body); },
};

const PATCH_T: Record<string, H> = {
  async campaigns(req, parts, body) { return M.updateCampaign(parts[1], body); },
  async tasks(req, parts, body) { return M.updateTask(parts[1], body); },
  async initiatives(req, parts, body) { return M.updateInitiative(parts[1], body); },
  async assumptions(req, parts, body) { return M.updateAssumption(parts[1], body.value); },
};
const DELETE_T: Record<string, H> = { async tasks(req, parts) { return M.deleteTask(parts[1]); } };

async function handle(table: Record<string, H>, req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const h = table[path[0]];
  if (!h) return NextResponse.json({ error: `No route ${req.method} /api/${path.join("/")}` }, { status: 404 });
  try {
    const body = req.method === "GET" || req.method === "DELETE" ? {} : await req.json().catch(() => ({}));
    const data = await h(req, path, body);
    return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
  } catch (e: any) {
    const status = e instanceof M.UserError ? 400 : 500;
    if (status === 500) console.error(e);
    return NextResponse.json({ error: e?.message || String(e) }, { status });
  }
}
type RC = { params: Promise<{ path: string[] }> };
export async function GET(req: NextRequest, ctx: RC) { return handle(GET_T, req, ctx); }
export async function POST(req: NextRequest, ctx: RC) { return handle(POST_T, req, ctx); }
export async function PATCH(req: NextRequest, ctx: RC) { return handle(PATCH_T, req, ctx); }
export async function DELETE(req: NextRequest, ctx: RC) { return handle(DELETE_T, req, ctx); }

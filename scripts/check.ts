import { resolveCtx, overview, funnel, campaignPerformance, ownerPerformance, stalledDeals, bottlenecks, initiativeStatus, growthModel, dataCoverage, trend } from "../lib/analytics";
async function main() {
  const t0 = Date.now();
  for (const d of ["2025-02-15", "2025-03-14", "2025-03-15", "2025-03-31", "2025-04-11", null]) {
    const ctx = await resolveCtx(d as any);
    const o = await overview(ctx);
    console.log(d, ctx.cut, "target", o.target?.target_version, o.target?.qualified_brands_goal, o.target?.confirmed_partnerships_goal, "| qualified", o.qualified, "| confirmed", o.confirmedCount, o.confirmedValue, "cash", o.cashConfirmedValue, "| open", o.openCount, o.openValue, "| days to event", o.daysToEvent, "| proj", o.forecast.projectedConfirmedCount, o.forecast.projectedConfirmedValue);
  }
  const ctx = await resolveCtx(null);
  const f = await funnel(ctx, "channel_group"); console.log(JSON.stringify(f.groups.map(g => [g.group, g.steps.map(s => s.brands)])));
  const f0 = await funnel(ctx, "none"); console.log(JSON.stringify(f0.groups.map(g => [g.group, g.steps.map(s => s.brands)])));
  const c = await campaignPerformance(ctx); console.table(c.map((x: any) => ({ n: x.campaign_name, t: x.touches, r: x.replies, mh: x.meetings_held, q: x.qualified_brands, o: x.opportunities, cf: x.confirmed, v: x.confirmed_value, open: x.open_opps })));
  console.table((await ownerPerformance(ctx)).map((x: any) => ({ n: x.owner_name, b: x.brands_owned, o: x.opportunities, c: x.confirmed, st: x.stalled_opps })));
  console.log("stalled", (await stalledDeals(ctx)).length);
  const b = await bottlenecks(ctx); for (const x of b.findings) console.log("-", x.type, x.title || x.group, x.evidence || "");
  const i = await initiativeStatus(ctx); for (const x of i.initiatives) console.log(x.initiative_id, x.kpi_key, x.kpi_value, x.signal, x.score, x.kpi_note);
  const g = await growthModel(); console.log("model base", g.base, "stretch", g.stretch);
  const tr = await trend(ctx); console.log("trend points", tr.series.length, tr.series.at(-1));
  const dc = await dataCoverage(); console.log(dc.importLog);
  console.log("ms", Date.now() - t0);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

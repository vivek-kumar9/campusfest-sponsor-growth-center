"use client";
import { useState } from "react";
import { useApi, mutate } from "@/lib/client";
import { Card, Table, Loading, Btn, Badge } from "@/components/ui";

export default function DataPage() {
  const cov = useApi<any>("/api/coverage", false);
  const audit = useApi<any[]>("/api/audit", false);
  const actions = useApi<any[]>("/api/actions", false);
  const health = useApi<any>("/api/health", false);
  const [busy, setBusy] = useState(false);
  const reset = async () => { if (!confirm("Restore the original dataset and default plan? All app edits, tasks and payments will be removed.")) return; setBusy(true); try { await mutate("/api/reset", "POST"); } finally { setBusy(false); } };
  if (!cov.data) return <Loading what="data coverage" />;
  const c = cov.data;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-xl font-bold">Data & Audit</h1><p className="text-sm text-slate-500">Source: {c.event.event_name} sponsor dataset (fictional), {c.event.history_start} to {c.event.history_end}, timezone {c.event.timezone}, currency {c.event.currency}.</p></div>
        <Btn kind="danger" onClick={reset} disabled={busy}>{busy ? "Restoring…" : "Reset to original data"}</Btn>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="What the data can answer"><ul className="list-disc space-y-1 pl-4 text-sm text-slate-700">{c.available.map((x: string) => <li key={x}>{x}</li>)}</ul></Card>
        <Card title="What it cannot answer"><ul className="list-disc space-y-1 pl-4 text-sm text-rose-800">{c.not_available.map((x: string) => <li key={x}>{x}</li>)}</ul></Card>
        <Card title="Counting rules"><ul className="list-disc space-y-1 pl-4 text-sm text-slate-700">{c.rules.map((x: string) => <li key={x}>{x}</li>)}</ul></Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Import log" subtitle="Rows with a repeated source ID and identical payload were dropped as import retries">
          <Table dense rows={c.importLog} cols={[{ key: "table_name", label: "Table" }, { key: "source_rows", label: "Source rows", align: "right" }, { key: "loaded_rows", label: "Loaded", align: "right" }, { key: "duplicates_skipped", label: "Duplicates dropped", align: "right" }, { key: "conflicting_duplicates", label: "Conflicts", align: "right" }]} />
          <div className="mt-3 text-xs text-slate-500">Current counts: {Object.entries(c.counts).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(" · ")}</div>
          <div className="mt-2 text-xs text-slate-500">Database: <b>{health.data?.db}</b> · AI key configured: <b>{String(health.data?.llm)}</b></div>
        </Card>
        <Card title="Copilot proposals" subtitle="Every AI-proposed change and whether a person confirmed it">
          <div className="max-h-72 overflow-y-auto"><Table dense rows={actions.data || []} empty="No proposals yet" cols={[{ key: "summary", label: "Proposal" }, { key: "action_type", label: "Type" }, { key: "status", label: "Status", render: (a) => <Badge color={a.status === "confirmed" ? "green" : a.status === "rejected" ? "slate" : "amber"}>{a.status}</Badge> }, { key: "created_at", label: "At", render: (a) => a.created_at?.slice(0, 16) }]} /></div>
        </Card>
      </div>
      <Card title="Audit log" subtitle="All changes made in the app (latest first)">
        <div className="max-h-96 overflow-y-auto"><Table dense rows={audit.data || []} empty="No changes yet" cols={[{ key: "at", label: "At (IST)", render: (a) => a.at.slice(0, 19) }, { key: "actor", label: "By" }, { key: "action", label: "Action" }, { key: "entity_type", label: "Entity" }, { key: "entity_id", label: "Id" }, { key: "detail", label: "Detail", render: (a) => <span className="font-mono text-[11px] text-slate-500">{a.detail?.slice(0, 160)}</span> }]} /></div>
      </Card>
    </div>
  );
}

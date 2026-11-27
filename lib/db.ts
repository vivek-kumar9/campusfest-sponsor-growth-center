// Database adapter: Postgres (DATABASE_URL / POSTGRES_URL, e.g. Neon or Supabase) with an
// embedded PGlite fallback for local dev and zero-config demos.
import type { Sql } from "postgres";

type Row = Record<string, any>;
export type DbMode = "postgres" | "pglite";

// type OIDs we normalise so both drivers return the same JS shapes
const OID = { int8: 20, numeric: 1700, timestamp: 1114, timestamptz: 1184, date: 1082 };
const num = (v: any) => (v === null || v === undefined ? v : Number(v));
const str = (v: any) => (v === null || v === undefined ? v : String(v));

interface Adapter {
  mode: DbMode;
  query(text: string, params?: any[]): Promise<Row[]>;
  exec(text: string): Promise<void>;
  tx<T>(fn: (q: (text: string, params?: any[]) => Promise<Row[]>) => Promise<T>): Promise<T>;
  readOnly(text: string, timeoutMs: number): Promise<{ rows: Row[]; columns: string[] }>;
}

let adapterPromise: Promise<Adapter> | null = null;

function connString() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL || "";
}

async function makePostgres(url: string): Promise<Adapter> {
  const postgres = (await import("postgres")).default;
  const sql: Sql = postgres(url, {
    prepare: false, // safe with transaction poolers (Supabase/Neon pooled URLs)
    max: 3,
    idle_timeout: 20,
    ssl: url.includes("localhost") ? false : "require",
    types: {
      int8: { to: OID.int8, from: [OID.int8], serialize: (x: any) => String(x), parse: num },
      numeric: { to: OID.numeric, from: [OID.numeric], serialize: (x: any) => String(x), parse: num },
      ts: { to: OID.timestamp, from: [OID.timestamp], serialize: (x: any) => String(x), parse: str },
      tstz: { to: OID.timestamptz, from: [OID.timestamptz], serialize: (x: any) => String(x), parse: str },
      date: { to: OID.date, from: [OID.date], serialize: (x: any) => String(x), parse: str },
    } as any,
    onnotice: () => {},
  });
  const q = (s: any) => async (text: string, params: any[] = []) => (await s.unsafe(text, params)) as unknown as Row[];
  return {
    mode: "postgres",
    query: q(sql),
    async exec(text) { await sql.unsafe(text); },
    async tx(fn) { return (await sql.begin(async (t: any) => fn(q(t)))) as any; },
    async readOnly(text, timeoutMs) {
      const res: any = await sql.begin("read only", async (t: any) => {
        await t.unsafe(`set local statement_timeout = ${Math.floor(timeoutMs)}`);
        return t.unsafe(text);
      });
      const columns = (res.columns || []).map((c: any) => c.name);
      return { rows: Array.from(res) as Row[], columns };
    },
  };
}

async function makePglite(): Promise<Adapter> {
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR || (process.env.VERCEL ? "/tmp/pgdata" : "./.pgdata");
  const db = new PGlite(dir, {
    parsers: {
      [OID.int8]: num, [OID.numeric]: num, [OID.timestamp]: str, [OID.timestamptz]: str, [OID.date]: str,
    } as any,
  });
  await db.waitReady;
  const q = (d: any) => async (text: string, params: any[] = []) => (await d.query(text, params)).rows as Row[];
  // PGlite is single-connection: serialise access to keep transactions isolated
  let chain: Promise<any> = Promise.resolve();
  const serial = <T,>(fn: () => Promise<T>) => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };
  return {
    mode: "pglite",
    query: (text, params) => serial(() => q(db)(text, params)),
    exec: (text) => serial(async () => { await db.exec(text); }),
    tx: (fn) => serial(() => db.transaction(async (t: any) => fn(q(t)))),
    readOnly: (text, timeoutMs) => serial(async () => {
      return db.transaction(async (t: any) => {
        await t.query("set transaction read only");
        await t.query(`set local statement_timeout = ${Math.floor(timeoutMs)}`);
        const res = await t.query(text);
        return { rows: res.rows as Row[], columns: (res.fields || []).map((f: any) => f.name) };
      });
    }),
  };
}

export async function getDb(): Promise<Adapter> {
  if (!adapterPromise) {
    adapterPromise = (async () => {
      const url = connString();
      const a = url ? await makePostgres(url) : await makePglite();
      const { ensureSchemaAndSeed } = await import("./seed");
      await ensureSchemaAndSeed(a);
      return a;
    })().catch((e) => { adapterPromise = null; throw e; });
  }
  return adapterPromise;
}

export async function q(text: string, params: any[] = []) { return (await getDb()).query(text, params); }
export async function q1(text: string, params: any[] = []): Promise<any> { return (await q(text, params))[0]; }
export type { Adapter };

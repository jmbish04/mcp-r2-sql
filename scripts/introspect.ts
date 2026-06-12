/**
 * @fileoverview Phase-0 warehouse introspection (re-runnable).
 *
 * Discovers the live R2 Data Catalog state for the CSLB warehouse and prints
 * a JSON document in the docs/cslb-schema.json shape:
 *   1. Catalog status + maintenance config (Catalog REST).
 *   2. Namespaces + tables (Catalog REST).
 *   3. Per-table DESCRIBE + COUNT(*) + sample rows via live R2 SQL,
 *      including per-query metrics (files_scanned / bytes_scanned).
 *
 * Usage:
 *   R2_SQL_TOKEN=... npx tsx scripts/introspect.ts > docs/cslb-schema.live.json
 *
 * Requires only Node 22+ (global fetch). The original Phase-0 discovery was
 * performed via Iceberg metadata files (see docs/cslb-schema.json provenance);
 * this script re-verifies through the SQL engine once a token exists.
 */

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? "b3304b14848de15c72c24a14b0cd187d";
const BUCKET = process.env.R2_BUCKET ?? "cslb-master-licenses-sql";
const TOKEN = process.env.R2_SQL_TOKEN;

if (!TOKEN) {
  console.error("R2_SQL_TOKEN env var is required (R2 Storage Admin R&W + Data Catalog R&W + R2 SQL Read).");
  process.exit(1);
}

const CATALOG_BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2-catalog/${BUCKET}`;
const SQL_URL = `https://api.sql.cloudflarestorage.com/api/v1/accounts/${ACCOUNT_ID}/r2-sql/query/${BUCKET}`;
const HEADERS = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

/** GET a catalog REST path and return the parsed `result`. */
async function catalogGet(path: string): Promise<any> {
  const resp = await fetch(`${CATALOG_BASE}${path}`, { headers: HEADERS });
  const body = (await resp.json()) as any;
  if (!body.success) throw new Error(`catalog ${path}: ${JSON.stringify(body.errors)}`);
  return body.result;
}

/** Run one R2 SQL statement; returns {rows, metrics} or throws with engine errors. */
async function sql(query: string): Promise<{ rows: any[]; metrics: any }> {
  const resp = await fetch(SQL_URL, { method: "POST", headers: HEADERS, body: JSON.stringify({ query }) });
  const body = (await resp.json()) as any;
  if (!body.success) throw new Error(`r2sql [${query.slice(0, 80)}]: ${JSON.stringify(body.errors)}`);
  return { rows: body.result.rows ?? [], metrics: body.result.metrics ?? {} };
}

async function main() {
  const catalog = await catalogGet("");
  const nsResult = await catalogGet("/namespaces");
  const namespaces: string[] = (nsResult.namespaces as string[][]).map((l) => l.join("."));

  const out: any = {
    discovered_at: new Date().toISOString(),
    discovery_method: "live R2 SQL DESCRIBE + COUNT(*) via scripts/introspect.ts",
    account_id: ACCOUNT_ID,
    bucket: BUCKET,
    catalog_status: catalog.status,
    maintenance_config: catalog.maintenance_config,
    namespaces,
    tables: {} as Record<string, any>,
  };

  for (const ns of namespaces) {
    const sep = encodeURIComponent("");
    const tablesResult = await catalogGet(`/namespaces/${ns.split(".").map(encodeURIComponent).join(sep)}/tables?return_details=true`);
    const tables: string[] = (tablesResult.details ?? tablesResult.identifiers ?? []).map((t: any) => t.name);
    for (const table of tables) {
      const fq = `${ns}.${table}`;
      console.error(`introspecting ${fq}...`);
      const describe = await sql(`DESCRIBE ${fq}`);
      const count = await sql(`SELECT COUNT(*) AS n FROM ${fq} LIMIT 1`);
      const sample = await sql(`SELECT * FROM ${fq} LIMIT 5`);
      out.tables[fq] = {
        columns: describe.rows,
        total_records: Number(count.rows[0]?.n ?? 0),
        count_metrics: count.metrics,
        sample_rows: sample.rows,
        sample_metrics: sample.metrics,
      };
    }
  }

  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

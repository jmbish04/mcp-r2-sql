/**
 * @fileoverview R2 Data Catalog REST client (introspection + health).
 *
 * Wraps the management API at:
 *   https://api.cloudflare.com/client/v4/accounts/{acct}/r2-catalog/{bucket}/...
 *
 * Uses the same `R2_SQL_TOKEN` bearer token as the SQL client (the token's
 * R2 Data Catalog Read & Write scope covers these endpoints). Nested
 * namespaces use the `%1F` (Unit Separator) join — handled by
 * {@link encodeNamespace}.
 *
 * All functions return `{ ok, status, ... }` shapes instead of throwing so
 * the diagnostics rollup can aggregate partial failures.
 */

/** Build the catalog REST base URL for this account/bucket. */
function base(env: Env): string {
  return `https://api.cloudflare.com/client/v4/accounts/${env.R2_ACCOUNT_ID}/r2-catalog/${env.R2_BUCKET}`;
}

/** Standard headers for catalog REST calls. */
function headers(env: Env): Record<string, string> {
  return { Authorization: `Bearer ${env.R2_SQL_TOKEN}`, "Content-Type": "application/json" };
}

/** Join nested namespace levels with the `%1F` unit separator for URL paths. */
export function encodeNamespace(levels: string[]): string {
  return levels.map(encodeURIComponent).join("%1F");
}

/** Generic GET against the catalog API, normalized to `{ok,status,result,errors}`. */
async function catalogGet<T>(env: Env, path: string): Promise<{ ok: boolean; status: number; result: T | null; errors: string[] }> {
  try {
    const resp = await fetch(`${base(env)}${path}`, { headers: headers(env), signal: AbortSignal.timeout(30_000) });
    const body = (await resp.json().catch(() => null)) as {
      success?: boolean;
      result?: T;
      errors?: { message?: string }[];
    } | null;
    return {
      ok: Boolean(body?.success),
      status: resp.status,
      result: body?.result ?? null,
      errors: (body?.errors ?? []).map((e) => e.message ?? "unknown error"),
    };
  } catch (err) {
    return { ok: false, status: 0, result: null, errors: [err instanceof Error ? err.message : String(err)] };
  }
}

/** Catalog details: status (active/disabled) + maintenance config. */
export interface CatalogStatus {
  id: string;
  name: string;
  bucket: string;
  status: string;
  maintenance_config?: {
    compaction?: { state?: string; target_size_mb?: string };
    snapshot_expiration?: { state?: string };
  };
  credential_status?: string;
}

/** Fetch catalog status + maintenance config for the warehouse bucket. */
export function getCatalogStatus(env: Env) {
  return catalogGet<CatalogStatus>(env, "");
}

/** List top-level namespaces in the catalog. */
export async function listNamespaces(env: Env) {
  const res = await catalogGet<{ namespaces: string[][] }>(env, "/namespaces");
  return { ...res, namespaces: res.result?.namespaces?.map((levels) => levels.join(".")) ?? [] };
}

/** Table listing entry (detailed form). */
export interface CatalogTable {
  name: string;
  created_at?: string;
  metadata_location?: string;
}

/** List tables (with details) in a namespace. */
export async function listTables(env: Env, namespace: string) {
  const ns = encodeNamespace(namespace.split("."));
  const res = await catalogGet<{ identifiers?: { name: string }[]; details?: CatalogTable[] }>(
    env,
    `/namespaces/${ns}/tables?return_details=true`,
  );
  const tables: CatalogTable[] =
    res.result?.details ?? res.result?.identifiers?.map((i) => ({ name: i.name })) ?? [];
  return { ...res, tables };
}

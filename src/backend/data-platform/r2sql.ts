/**
 * @fileoverview R2 SQL HTTP client.
 *
 * Thin typed wrapper around the R2 SQL query endpoint:
 *   POST https://api.sql.cloudflarestorage.com/api/v1/accounts/{acct}/r2-sql/query/{bucket}
 *
 * Authenticated with the `R2_SQL_TOKEN` secret (R2 Storage Admin R&W +
 * R2 Data Catalog R&W + R2 SQL Read — the Storage Admin scope is an
 * open-beta requirement even for read-only SQL).
 *
 * Errors are mapped into the normalized {@link R2SqlResult} shape rather than
 * thrown, so route handlers and AI tools can surface engine messages
 * (e.g. "OFFSET not supported") directly to the user.
 */

import { getR2SqlToken } from "./secrets";
import type { R2SqlResult } from "./types";

/** Wall-clock cap for a single R2 SQL round trip (the engine's own cap is 180s). */
const QUERY_TIMEOUT_MS = 180_000;

/**
 * Execute a (pre-guarded) SQL statement against the R2 SQL engine.
 *
 * @param env - Worker bindings (needs R2_ACCOUNT_ID, R2_BUCKET, R2_SQL_TOKEN).
 * @param sql - The SQL text to run. Callers should pass it through
 *              `guardSql()` first; this function does not re-validate.
 * @returns Normalized {@link R2SqlResult} — never throws on engine errors;
 *          network-level failures are mapped to `ok: false` with a message.
 *
 * @example
 * const res = await queryR2Sql(env, "SELECT COUNT(*) AS n FROM sf_dbi.building_permits LIMIT 1");
 * if (res.ok) console.log(res.rows[0].n, res.metrics.bytes_scanned);
 */
export async function queryR2Sql(env: Env, sql: string): Promise<R2SqlResult> {
  const url = `https://api.sql.cloudflarestorage.com/api/v1/accounts/${env.R2_ACCOUNT_ID}/r2-sql/query/${env.R2_BUCKET}`;
  const started = Date.now();

  const token = await getR2SqlToken(env);
  if (!token) {
    return {
      ok: false,
      rows: [],
      schema: [],
      metrics: {},
      requestId: null,
      errors: [{ code: null, message: "R2_SQL_TOKEN secret is not configured (Secrets Store binding R2_SQL_TOKEN → CLOUDFLARE_R2_SQL_TOKEN)." }],
      status: 0,
      durationMs: 0,
    };
  }

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
      signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
    });

    const durationMs = Date.now() - started;
    const body = (await resp.json().catch(() => null)) as {
      success?: boolean;
      result?: {
        request_id?: string;
        schema?: R2SqlResult["schema"];
        rows?: Record<string, unknown>[];
        metrics?: R2SqlResult["metrics"];
      };
      errors?: { code?: number; message?: string }[];
    } | null;

    if (!body) {
      return {
        ok: false, rows: [], schema: [], metrics: {}, requestId: null, status: resp.status, durationMs,
        errors: [{ code: null, message: `R2 SQL returned a non-JSON response (HTTP ${resp.status}).` }],
      };
    }

    if (body.success && body.result) {
      return {
        ok: true,
        rows: body.result.rows ?? [],
        schema: body.result.schema ?? [],
        metrics: body.result.metrics ?? {},
        requestId: body.result.request_id ?? null,
        errors: [],
        status: resp.status,
        durationMs,
      };
    }

    return {
      ok: false,
      rows: [],
      schema: [],
      metrics: {},
      requestId: body.result?.request_id ?? null,
      errors: (body.errors ?? [{ message: `R2 SQL request failed (HTTP ${resp.status}).` }]).map((e) => ({
        code: e.code ?? null,
        message: e.message ?? "Unknown R2 SQL error",
      })),
      status: resp.status,
      durationMs,
    };
  } catch (err) {
    return {
      ok: false, rows: [], schema: [], metrics: {}, requestId: null, status: 0,
      durationMs: Date.now() - started,
      errors: [{ code: null, message: `R2 SQL network error: ${err instanceof Error ? err.message : String(err)}` }],
    };
  }
}

/**
 * @fileoverview SF SODA (Socrata) Building Permits client.
 *
 * Queries the public DataSF "Building Permits" dataset (i98e-djp9) via its
 * SODA 2.1 endpoint, configured by the `SODA_PERMITS_URL` var. The dataset is
 * public — no app token required (rate limits are generous for this volume).
 *
 * Notes:
 *  - The dataset has NO contractor/license column — contractor vetting is
 *    served by the R2 SQL `sf_dbi.permit_contractors` table instead. SODA is
 *    used for live address / permit-number lookups.
 *  - SODA string matching is case-sensitive; street names in the dataset are
 *    UPPERCASE, so inputs are upper-cased before comparison.
 */

import type { SodaResult } from "./types";

/** Maximum rows requested from SODA per lookup. */
const SODA_LIMIT = 200;

/** Escape a value for embedding in a SODA `$where` single-quoted string. */
function sq(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Run a SODA query with the given query-string params. */
async function sodaFetch(env: Env, params: Record<string, string>): Promise<SodaResult> {
  const url = new URL(env.SODA_PERMITS_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const started = Date.now();
  try {
    const resp = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    const durationMs = Date.now() - started;
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return { ok: false, rows: [], url: url.toString(), status: resp.status, durationMs, error: `SODA HTTP ${resp.status}: ${text.slice(0, 300)}` };
    }
    const rows = (await resp.json()) as Record<string, unknown>[];
    return { ok: true, rows, url: url.toString(), status: resp.status, durationMs };
  } catch (err) {
    return {
      ok: false, rows: [], url: url.toString(), status: 0, durationMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Look up permits for a street address.
 *
 * @param env - Worker bindings (needs SODA_PERMITS_URL).
 * @param input - street number + street name (+ optional unit).
 * @returns Permit history rows ordered by filed date (newest first).
 *
 * @example
 * await lookupPermitsByAddress(env, { streetNumber: "301", streetName: "Mission" })
 */
export function lookupPermitsByAddress(
  env: Env,
  input: { streetNumber: string; streetName: string; unit?: string },
): Promise<SodaResult> {
  const clauses = [
    `street_number = ${sq(input.streetNumber.trim())}`,
    `upper(street_name) = ${sq(input.streetName.trim().toUpperCase())}`,
  ];
  if (input.unit?.trim()) clauses.push(`upper(unit) = ${sq(input.unit.trim().toUpperCase())}`);
  return sodaFetch(env, {
    $where: clauses.join(" AND "),
    $order: "filed_date DESC",
    $limit: String(SODA_LIMIT),
  });
}

/**
 * Look up a single permit by its permit number.
 *
 * @example
 * await lookupPermitByNumber(env, "202101010001")
 */
export function lookupPermitByNumber(env: Env, permitNumber: string): Promise<SodaResult> {
  return sodaFetch(env, {
    $where: `permit_number = ${sq(permitNumber.trim())}`,
    $limit: "10",
  });
}

/**
 * Generic raw `$where` lookup for advanced use (agent tooling).
 * The clause is passed through to SODA verbatim — SODA itself rejects
 * malformed input; this endpoint is read-only by construction.
 */
export function lookupPermitsWhere(env: Env, where: string): Promise<SodaResult> {
  return sodaFetch(env, {
    $where: where,
    $order: "filed_date DESC",
    $limit: String(SODA_LIMIT),
  });
}

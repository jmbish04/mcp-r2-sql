/**
 * @fileoverview Contractor / architect / engineer vetting against the
 * warehouse's `sf_dbi.permit_contractors` table.
 *
 * Phase-0 deviation note: despite the bucket name, the warehouse contains NO
 * CSLB master-license table. `sf_dbi.permit_contractors` is the real vetting
 * source — it carries `license1` (CSLB license number), `firm_name`, `role`
 * (contractor / architect / engineer / owner ...), firm address fields, and
 * full permit linkage. Vetting therefore answers: "what is this firm's SF
 * permit track record?" rather than "is this license active with CSLB?".
 *
 * Shared by the `/api/vetting/contractor` route and the chat agent's
 * `vet_contractor` tool.
 */

import { guardSql } from "./guard";
import { queryR2Sql } from "./r2sql";
import type { R2SqlMetrics } from "./types";

/** Input for a vetting lookup — at least one of license / name required. */
export interface VetContractorInput {
  /** CSLB license number (exact match on license1). */
  license?: string;
  /** Firm name (case-insensitive substring match). */
  name?: string;
  /** Optional firm city filter (case-insensitive). */
  city?: string;
  /** Optional role filter: contractor | architect | engineer (substring match). */
  role?: string;
}

/** Aggregate profile + recent permits for a vetted firm. */
export interface VetContractorResult {
  ok: boolean;
  error?: string;
  /** Aggregate rows: one per (firm_name, license1, role) combination. */
  profile: Record<string, unknown>[];
  /** Most recent permit engagements (up to 50). */
  recentPermits: Record<string, unknown>[];
  metrics: R2SqlMetrics;
  /** The profile SQL executed (shown in the UI for transparency). */
  sql: string;
}

/** Escape a value for a single-quoted R2 SQL string literal. */
function sq(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Build the shared WHERE clause for both vetting queries. */
function whereClause(input: VetContractorInput): string | null {
  const clauses: string[] = [];
  if (input.license?.trim()) clauses.push(`license1 = ${sq(input.license.trim())}`);
  if (input.name?.trim()) clauses.push(`firm_name ILIKE ${sq(`%${input.name.trim()}%`)}`);
  if (!clauses.length) return null;
  if (input.city?.trim()) clauses.push(`firm_city ILIKE ${sq(`%${input.city.trim()}%`)}`);
  if (input.role?.trim()) clauses.push(`role ILIKE ${sq(`%${input.role.trim()}%`)}`);
  return clauses.join(" AND ");
}

/**
 * Vet a contractor/architect/engineer by license number and/or firm name.
 *
 * Runs two guarded R2 SQL queries:
 *  1. Aggregate profile per (firm_name, license1, role): permit counts,
 *     issued/completed counts, active span, distinct addresses.
 *  2. The 50 most recent permit engagements with status + description.
 */
export async function vetContractor(env: Env, input: VetContractorInput): Promise<VetContractorResult> {
  const where = whereClause(input);
  if (!where) {
    return { ok: false, error: "Provide a license number and/or a firm name.", profile: [], recentPermits: [], metrics: {}, sql: "" };
  }

  const ns = env.R2_NAMESPACE;
  const profileSql = `SELECT firm_name, license1, role,
  COUNT(*) AS permit_engagements,
  SUM(CASE WHEN issued_date IS NOT NULL THEN 1 ELSE 0 END) AS issued_count,
  SUM(CASE WHEN completed_date IS NOT NULL THEN 1 ELSE 0 END) AS completed_count,
  MIN(filed_date) AS first_filed,
  MAX(filed_date) AS last_filed,
  approx_distinct(permit_number) AS distinct_permits,
  approx_distinct(street_name) AS distinct_streets,
  MAX(firm_city) AS firm_city,
  MAX(firm_state) AS firm_state
FROM ${ns}.permit_contractors
WHERE ${where}
GROUP BY firm_name, license1, role
ORDER BY permit_engagements DESC
LIMIT 50`;

  const recentSql = `SELECT permit_number, permit_type_definition, role, status, description,
  street_number, street_name, street_suffix, filed_date, issued_date, completed_date, firm_name, license1
FROM ${ns}.permit_contractors
WHERE ${where}
ORDER BY filed_date DESC
LIMIT 50`;

  const profileGuard = guardSql(profileSql);
  const recentGuard = guardSql(recentSql);
  if (!profileGuard.allowed || !recentGuard.allowed) {
    return { ok: false, error: profileGuard.reason ?? recentGuard.reason, profile: [], recentPermits: [], metrics: {}, sql: profileSql };
  }

  const [profile, recent] = await Promise.all([
    queryR2Sql(env, profileGuard.sql),
    queryR2Sql(env, recentGuard.sql),
  ]);

  if (!profile.ok) {
    return { ok: false, error: profile.errors[0]?.message ?? "Profile query failed", profile: [], recentPermits: [], metrics: profile.metrics, sql: profileGuard.sql };
  }

  return {
    ok: true,
    profile: profile.rows,
    recentPermits: recent.ok ? recent.rows : [],
    metrics: {
      files_scanned: (profile.metrics.files_scanned ?? 0) + (recent.metrics.files_scanned ?? 0),
      bytes_scanned: (profile.metrics.bytes_scanned ?? 0) + (recent.metrics.bytes_scanned ?? 0),
    },
    sql: profileGuard.sql,
  };
}

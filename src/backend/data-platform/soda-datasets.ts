/**
 * @fileoverview SF DataSF (Socrata/SODA) dataset registry + generic client.
 *
 * Beyond the core Building Permits dataset, a homeowner watching their property
 * cares about a constellation of DBI/Fire/Planning signals — all live SODA
 * datasets keyed by block/lot, parcel number, or address. This module provides:
 *   - `sodaQuery(env, datasetId, params)` — query ANY DataSF resource id.
 *   - `SODA_DATASETS` — a registry of the watched datasets with per-dataset
 *     `$where` builders (each dataset types block/lot/street differently).
 *   - `fetchDataset()` / `propertySignals()` — per-property lookups.
 *   - `dbiWorkload()` — aggregate "how busy is DBI right now" turnaround signal.
 *
 * All datasets are public (no app token). These are LIVE per-property lookups;
 * warehouse-scale ingestion of the same datasets is the ingestion pipeline's
 * job (see docs/0003_pipeline_migration).
 */

import type { SodaResult } from "./types";

const SODA_BASE = "https://data.sfgov.org/resource";
const DEFAULT_LIMIT = 200;

/** Escape a value for a single-quoted SoQL string literal. */
function sq(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Property identifiers a homeowner can key signals on. */
export interface PropertyKeys {
  block?: string;
  lot?: string;
  parcelNumber?: string;
  streetNumber?: string;
  streetName?: string;
  zip?: string;
  /** Building Permit Application number (for application-keyed datasets). */
  bpa?: string;
  /** Completeness-check submission id (abh5-gwaq). */
  submissionId?: string;
  /** Planning project record id, e.g. 2025-004437PRJ (d4jk-jw33). */
  altId?: string;
}

/** Normalize keys: derive parcelNumber (block+lot padded) when possible. */
function normalizeKeys(k: PropertyKeys): PropertyKeys {
  const out = { ...k };
  if (!out.parcelNumber && out.block && out.lot) {
    out.parcelNumber = `${out.block}${out.lot.padStart(3, "0")}`;
  }
  if (out.streetName) out.streetName = out.streetName.trim();
  return out;
}

/** Run a SODA query against an arbitrary DataSF resource id. */
export async function sodaQuery(
  datasetId: string,
  params: Record<string, string>,
): Promise<SodaResult> {
  const url = new URL(`${SODA_BASE}/${datasetId}.json`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
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
    return { ok: false, rows: [], url: url.toString(), status: 0, durationMs: Date.now() - started, error: err instanceof Error ? err.message : String(err) };
  }
}

/** One watched DataSF dataset. */
export interface SodaDataset {
  /** Stable registry key used by the API + agent. */
  key: string;
  /** DataSF resource id (the `xxxx-xxxx` in the URL). */
  id: string;
  label: string;
  description: string;
  /** Default `$order`. */
  order?: string;
  /** Build the `$where` clause for a property, or null if keys are insufficient. */
  buildWhere: (k: PropertyKeys) => string | null;
}

/** Address clause where street_number is TEXT (NOV, fire inspections-ish). */
function addrTextWhere(k: PropertyKeys): string | null {
  if (k.streetNumber && k.streetName) {
    return `street_number = ${sq(k.streetNumber)} AND upper(street_name) = ${sq(k.streetName.toUpperCase())}`;
  }
  return null;
}

/** Block/lot clause (both TEXT in DBI datasets). */
function blockLotWhere(k: PropertyKeys): string | null {
  if (k.block && k.lot) return `block = ${sq(k.block)} AND lot = ${sq(k.lot)}`;
  return null;
}

/**
 * The watched datasets. Each `buildWhere` encodes that dataset's own field
 * types (street_number is Number in the metrics datasets, Text elsewhere).
 */
export const SODA_DATASETS: SodaDataset[] = [
  {
    key: "notices_of_violation",
    id: "nbtm-fbw5",
    label: "Notices of Violation (DBI)",
    description: "Actual violations + inspector comments found during inspection. Watch your contractor/subs during renovation.",
    order: "complaint_number, item_sequence_number",
    buildWhere: (k) => blockLotWhere(k) ?? addrTextWhere(k),
  },
  {
    key: "dbi_complaints",
    id: "gm2e-bten",
    label: "DBI Complaints",
    description: "Complaints filed with DBI — pairs with Notices of Violation for the full picture.",
    order: "date_filed DESC",
    buildWhere: (k) => blockLotWhere(k) ?? addrTextWhere(k),
  },
  {
    key: "fire_permits",
    id: "893e-xam6",
    label: "Fire Permits (SFFD)",
    description: "SF Fire permits. Watch for sprinkler-trigger activity — large scopes can require fire sprinklers.",
    order: "permit_number DESC",
    buildWhere: (k) => {
      const clauses: string[] = [];
      if (k.zip) clauses.push(`permit_zipcode = ${sq(k.zip)}`);
      if (k.streetNumber) clauses.push(`upper(permit_address) like ${sq(`%${k.streetNumber.toUpperCase()}%`)}`);
      if (k.streetName) clauses.push(`upper(permit_address) like ${sq(`%${k.streetName.toUpperCase()}%`)}`);
      return clauses.length ? clauses.join(" AND ") : null;
    },
  },
  {
    key: "planning_review",
    id: "tyz3-vt28",
    label: "Permits requiring Planning review",
    description: "Doors/siding/windows, fire alarm, fire sprinkler, special-event permits that require Planning Committee review (e.g. street-facing windows).",
    buildWhere: (k) => (k.parcelNumber ? `upper(parcel_number) like ${sq(`%${k.parcelNumber.toUpperCase()}%`)}` : null),
  },
  {
    key: "fire_inspections",
    id: "wb4c-6hwj",
    label: "Fire Inspections (SFFD)",
    description: "Fire Department inspections at a location (complaint-driven or routine).",
    order: "inspection_start_date DESC",
    buildWhere: (k) => {
      const clauses: string[] = [];
      if (k.streetNumber) clauses.push(`upper(address) like ${sq(`%${k.streetNumber.toUpperCase()}%`)}`);
      if (k.streetName) clauses.push(`upper(address) like ${sq(`%${k.streetName.toUpperCase()}%`)}`);
      return clauses.length ? clauses.join(" AND ") : null;
    },
  },
  {
    key: "permit_contacts",
    id: "cw8k-gwb7",
    label: "Building Permits + Contacts",
    description: "Permits merged with their contacts (firm name/address, license numbers) — who is working on the property.",
    buildWhere: (k) => {
      if (k.streetNumber && k.streetName) {
        return `street_number = ${sq(k.streetNumber)} AND upper(street_name) = ${sq(k.streetName.toUpperCase())}`;
      }
      return null;
    },
  },
  {
    key: "review_metrics",
    id: "5bat-azvb",
    label: "Permit Application Review Metrics",
    description: "Per-station plan-review times for an application + whether each met the City's target review time.",
    order: "start_date DESC",
    buildWhere: (k) => {
      if (k.block && k.lot) return `block = ${sq(k.block)} AND lot = ${sq(k.lot)}`;
      if (k.streetNumber && k.streetName) return `street_number = ${Number(k.streetNumber) || 0} AND upper(street_name) = ${sq(k.streetName.toUpperCase())}`;
      return null;
    },
  },
  {
    key: "issuance_metrics",
    id: "gzxm-jz5j",
    label: "Permit Issuance Metrics",
    description: "Time from filing to issuance for issued permits (filed_date → issued_date).",
    buildWhere: (k) => {
      if (k.block && k.lot) return `block = ${sq(k.block)} AND lot = ${sq(k.lot)}`;
      if (k.streetNumber && k.streetName) return `street_number = ${Number(k.streetNumber) || 0} AND upper(street_name) = ${sq(k.streetName.toUpperCase())}`;
      return null;
    },
  },
  {
    // Application-keyed (submission_id), NOT property-keyed — skipped by
    // propertySignals; powers the City completeness-check review-pace baseline.
    key: "completeness_metrics",
    id: "abh5-gwaq",
    label: "Permit Completeness Check Review Metrics",
    description: "Time DBI takes to complete the completeness check on an application (+ whether it met the City target). Keyed by submission_id; used as a City review-pace baseline.",
    order: "start_date DESC",
    buildWhere: (k) => (k.submissionId ? `submission_id = ${sq(k.submissionId)}` : null),
  },
  {
    // Planning project-keyed (b1_alt_id), NOT property-keyed — powers the City
    // planning review-pace baseline.
    key: "planning_metrics",
    id: "d4jk-jw33",
    label: "Planning Project Application Review Metrics",
    description: "Planning review times by stage (completeness/first/resubmission) + whether each met the deadline. Keyed by project id (b1_alt_id); used as a City review-pace baseline.",
    order: "start_event_date DESC",
    buildWhere: (k) => (k.altId ? `b1_alt_id = ${sq(k.altId)}` : null),
  },
];

/** Registry lookup by key. */
export function getDataset(key: string): SodaDataset | undefined {
  return SODA_DATASETS.find((d) => d.key === key);
}

/** Fetch one watched dataset for a property. */
export async function fetchDataset(
  key: string,
  keys: PropertyKeys,
  limit = DEFAULT_LIMIT,
): Promise<SodaResult & { key: string; label: string }> {
  const ds = getDataset(key);
  if (!ds) return { ok: false, rows: [], url: "", status: 0, durationMs: 0, error: `unknown dataset "${key}"`, key, label: key };
  const where = ds.buildWhere(normalizeKeys(keys));
  if (!where) {
    return { ok: false, rows: [], url: "", status: 0, durationMs: 0, error: "insufficient property keys for this dataset", key: ds.key, label: ds.label };
  }
  const params: Record<string, string> = { $where: where, $limit: String(limit) };
  if (ds.order) params.$order = ds.order;
  const res = await sodaQuery(ds.id, params);
  return { ...res, key: ds.key, label: ds.label };
}

/** Fetch ALL watched datasets for a property in parallel (the full picture). */
export async function propertySignals(
  keys: PropertyKeys,
  opts: { only?: string[]; limit?: number } = {},
): Promise<{
  keys: PropertyKeys;
  datasets: Record<string, { ok: boolean; label: string; count: number; rows: Record<string, unknown>[]; error?: string }>;
}> {
  const normalized = normalizeKeys(keys);
  const wanted = opts.only?.length ? SODA_DATASETS.filter((d) => opts.only!.includes(d.key)) : SODA_DATASETS;
  const results = await Promise.all(wanted.map((d) => fetchDataset(d.key, normalized, opts.limit ?? 100)));
  const datasets: Record<string, { ok: boolean; label: string; count: number; rows: Record<string, unknown>[]; error?: string }> = {};
  for (const r of results) {
    datasets[r.key] = { ok: r.ok, label: r.label, count: r.rows.length, rows: r.rows, error: r.error };
  }
  return { keys: normalized, datasets };
}

/**
 * "How busy is DBI right now?" — recent issuance turnaround from the Building
 * Permit Issuance Metrics dataset (gzxm-jz5j), split by OTC vs in-house.
 * Used to contextualize whether a given permit is slow vs the current baseline.
 */
export async function dbiWorkload(windowDays = 90, now: Date = new Date()): Promise<{
  ok: boolean;
  windowDays: number;
  since: string;
  overall?: { count: number; avgDays: number | null; medianDays: number | null };
  byType?: { otc_ih: string; count: number; avgDays: number | null }[];
  error?: string;
}> {
  const since = new Date(now.getTime() - windowDays * 86_400_000).toISOString().slice(0, 19);
  // Aggregate over recently-issued permits. calendar_days = filed→issued span.
  const res = await sodaQuery("gzxm-jz5j", {
    $select: "otc_ih, count(*) as count, avg(calendar_days) as avg_days",
    $where: `issued_date > '${since}' AND calendar_days >= 0`,
    $group: "otc_ih",
  });
  if (!res.ok) return { ok: false, windowDays, since, error: res.error };
  const byType = res.rows.map((r) => ({
    otc_ih: String(r.otc_ih ?? "unknown"),
    count: Number(r.count ?? 0),
    avgDays: r.avg_days != null ? Math.round(Number(r.avg_days)) : null,
  }));
  const totalCount = byType.reduce((a, b) => a + b.count, 0);
  const weightedAvg = totalCount
    ? Math.round(byType.reduce((a, b) => a + (b.avgDays ?? 0) * b.count, 0) / totalCount)
    : null;
  return { ok: true, windowDays, since, overall: { count: totalCount, avgDays: weightedAvg, medianDays: null }, byType };
}

/** ISO start-of-second timestamp `windowDays` ago. */
function sinceTs(windowDays: number, now: Date): string {
  return new Date(now.getTime() - windowDays * 86_400_000).toISOString().slice(0, 19);
}

/**
 * City completeness-check review pace (abh5-gwaq): recent avg calendar days +
 * percent meeting the City's target review time. Keyed by met_cal_sla group.
 */
export async function completenessReviewPace(windowDays = 90, now: Date = new Date()): Promise<{
  ok: boolean; count: number; avgDays: number | null; pctMetSla: number | null; error?: string;
}> {
  const since = sinceTs(windowDays, now);
  const res = await sodaQuery("abh5-gwaq", {
    $select: "met_cal_sla, count(*) as n, avg(calendar_days) as avg_days",
    $where: `start_date > '${since}' AND calendar_days >= 0`,
    $group: "met_cal_sla",
  });
  if (!res.ok) return { ok: false, count: 0, avgDays: null, pctMetSla: null, error: res.error };
  let total = 0, met = 0, weighted = 0;
  for (const r of res.rows) {
    const n = Number(r.n ?? 0);
    total += n;
    if (r.met_cal_sla === true || r.met_cal_sla === "true") met += n;
    weighted += (r.avg_days != null ? Number(r.avg_days) : 0) * n;
  }
  return { ok: true, count: total, avgDays: total ? Math.round(weighted / total) : null, pctMetSla: total ? Math.round((met / total) * 100) : null };
}

/**
 * City planning review pace (d4jk-jw33), by stage (completeness check / first
 * review / resubmission): recent avg days + percent under the deadline.
 */
export async function planningReviewPace(windowDays = 90, now: Date = new Date()): Promise<{
  ok: boolean; byStage: { stage: string; count: number; avgDays: number | null; pctUnderDeadline: number | null }[]; error?: string;
}> {
  const since = sinceTs(windowDays, now);
  const res = await sodaQuery("d4jk-jw33", {
    $select: "project_stage, metric_outcome, count(*) as n, avg(metric_value) as avg_days",
    $where: `start_event_date > '${since}' AND metric_value >= 0`,
    $group: "project_stage, metric_outcome",
  });
  if (!res.ok) return { ok: false, byStage: [], error: res.error };
  const acc: Record<string, { total: number; under: number; weighted: number }> = {};
  for (const r of res.rows) {
    const stage = String(r.project_stage ?? "unknown");
    const n = Number(r.n ?? 0);
    const a = (acc[stage] ??= { total: 0, under: 0, weighted: 0 });
    a.total += n;
    if (/under/i.test(String(r.metric_outcome ?? ""))) a.under += n;
    a.weighted += (r.avg_days != null ? Number(r.avg_days) : 0) * n;
  }
  const byStage = Object.entries(acc).map(([stage, a]) => ({
    stage, count: a.total,
    avgDays: a.total ? Math.round(a.weighted / a.total) : null,
    pctUnderDeadline: a.total ? Math.round((a.under / a.total) * 100) : null,
  }));
  return { ok: true, byStage };
}

/**
 * Combined "how busy is the City right now" review-pace report: DBI issuance
 * turnaround + DBI completeness-check pace + Planning review pace. Use to judge
 * whether a given permit is slow vs the City's CURRENT baseline.
 */
export async function cityReviewPace(windowDays = 90, now: Date = new Date()): Promise<{
  windowDays: number;
  issuance: Awaited<ReturnType<typeof dbiWorkload>>;
  completenessCheck: Awaited<ReturnType<typeof completenessReviewPace>>;
  planningReview: Awaited<ReturnType<typeof planningReviewPace>>;
}> {
  const [issuance, completenessCheck, planningReview] = await Promise.all([
    dbiWorkload(windowDays, now),
    completenessReviewPace(windowDays, now),
    planningReviewPace(windowDays, now),
  ]);
  return { windowDays, issuance, completenessCheck, planningReview };
}

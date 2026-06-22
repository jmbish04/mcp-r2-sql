/**
 * @fileoverview Derived permit status.
 *
 * The raw DBI `status` field doesn't distinguish a still-live "filed" permit
 * from one that has effectively lapsed. Homeowners care about that: a permit
 * filed over a year ago and never issued is, in practice, expired. This derives
 * a homeowner-meaningful lifecycle state from the raw status + filed date:
 *
 *   - status = "completed"                         → "inactive"
 *   - status = "filed" AND filed > 365 days ago    → "expired"
 *   - status = "filed" AND filed ≤ 365 days ago    → "active"
 *   - anything else                                → "active" (issued/in-review)
 *     except terminal statuses (cancelled/withdrawn/expired) → "inactive".
 */

export type DerivedStatus = "active" | "expired" | "inactive";

const MS_PER_DAY = 86_400_000;

/** Whole days between a past date and now (negative if the date is in the future). */
export function daysSince(date: string | Date | null | undefined, now: Date = new Date()): number | null {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((now.getTime() - d.getTime()) / MS_PER_DAY);
}

/** Terminal raw statuses that always read as inactive regardless of dates. */
const TERMINAL = /(complete|cancel|withdraw|expire|revoke|abandon)/i;

/**
 * Derive the homeowner-facing lifecycle status for a permit.
 *
 * @param rawStatus - the DBI `status` / `current_status` value.
 * @param dateFiled - the permit's filed date (ISO string or Date).
 * @param now - injectable clock for testing.
 * @returns "active" | "expired" | "inactive".
 *
 * @example
 * derivePermitStatus("filed", "2023-01-01") // "expired" (>365d)
 * derivePermitStatus("filed", "2026-05-01") // "active"  (≤365d)
 * derivePermitStatus("complete", "2020-01-01") // "inactive"
 */
export function derivePermitStatus(
  rawStatus: string | null | undefined,
  dateFiled: string | Date | null | undefined,
  now: Date = new Date(),
): DerivedStatus {
  const s = String(rawStatus ?? "").trim().toLowerCase();

  if (/complete/.test(s)) return "inactive";
  if (TERMINAL.test(s)) return "inactive";

  if (s === "filed" || s === "filing" || s === "incomplete") {
    const age = daysSince(dateFiled, now);
    if (age !== null && age > 365) return "expired";
    return "active";
  }

  // issued / approved / reinstated / in review / etc. → active.
  return "active";
}

/** Attach `derived_status` (+ `filed_age_days`) to a permit-like row. */
export function withDerivedStatus<T extends Record<string, unknown>>(
  row: T,
  now: Date = new Date(),
): T & { derived_status: DerivedStatus; filed_age_days: number | null } {
  const status = (row.status ?? row.current_status) as string | undefined;
  const filed = (row.filed_date ?? row.date_filed ?? row.filed) as string | undefined;
  return { ...row, derived_status: derivePermitStatus(status, filed, now), filed_age_days: daysSince(filed, now) };
}

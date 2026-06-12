/**
 * @fileoverview Shared types for the R2 Data Catalog / R2 SQL data-platform
 * layer (R2 SQL client, catalog client, SODA client, query guard).
 *
 * Mirrors the wire formats documented in the Cloudflare data-platform skill:
 * R2 SQL responses carry `rows`, a `schema` descriptor array, and per-query
 * `metrics` (files/bytes scanned), all of which we surface to the frontend
 * and to the AI interpretation providers.
 */

/** Column descriptor returned by R2 SQL in `result.schema`. */
export interface R2SqlColumnDescriptor {
  name: string;
  descriptor: {
    type: { name: string } & Record<string, unknown>;
    nullable?: boolean;
  } & Record<string, unknown>;
}

/** Per-query execution metrics returned by R2 SQL. */
export interface R2SqlMetrics {
  r2_requests_count?: number;
  files_scanned?: number;
  bytes_scanned?: number;
  cache_hits?: number;
}

/** Normalized result of an R2 SQL query (success or mapped failure). */
export interface R2SqlResult {
  /** True when the engine returned `success: true`. */
  ok: boolean;
  /** Result rows (empty on failure). */
  rows: Record<string, unknown>[];
  /** Column schema descriptors (empty on failure). */
  schema: R2SqlColumnDescriptor[];
  /** Per-query metrics (files/bytes scanned, cache hits). */
  metrics: R2SqlMetrics;
  /** Engine-assigned request id, useful for support/debugging. */
  requestId: string | null;
  /** Mapped error messages when `ok` is false. */
  errors: { code: number | null; message: string }[];
  /** HTTP status from the R2 SQL endpoint. */
  status: number;
  /** Wall-clock duration of the round trip in milliseconds. */
  durationMs: number;
}

/** Outcome of guarding/normalizing a SQL statement before execution. */
export interface GuardResult {
  /** True when the statement is allowed to run. */
  allowed: boolean;
  /** The (possibly rewritten) SQL to execute — e.g. with LIMIT injected. */
  sql: string;
  /** Human-readable rejection reason when `allowed` is false. */
  reason?: string;
  /** Notes about rewrites applied (LIMIT injected/capped). */
  rewrites: string[];
  /** Statement kind: select | with | show | describe | explain. */
  kind: "select" | "with" | "show" | "describe" | "explain" | "unknown";
}

/** A building-permit record from the SF SODA API (subset of fields). */
export type SodaPermit = Record<string, unknown>;

/** Normalized SODA lookup result. */
export interface SodaResult {
  ok: boolean;
  rows: SodaPermit[];
  /** The fully-qualified SODA URL queried (for observability). */
  url: string;
  status: number;
  error?: string;
  durationMs: number;
}

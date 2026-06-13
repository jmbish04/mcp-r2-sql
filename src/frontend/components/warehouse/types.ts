/**
 * @fileoverview Shared types for the warehouse frontend islands (dashboard,
 * query workbench, vetting tool, assistant panel). Mirrors the response
 * shapes of /api/r2/*, /api/ai/*, /api/vetting/*, /api/permits/*.
 */

/** Response of POST /api/r2/query. */
export interface QueryResponse {
  ok: boolean;
  sql: string;
  rewrites: string[];
  rows: Record<string, unknown>[];
  schema: Record<string, unknown>[];
  metrics: {
    r2_requests_count?: number;
    files_scanned?: number;
    bytes_scanned?: number;
    cache_hits?: number;
  };
  requestId: string | null;
  durationMs: number;
  errors: { code: number | null; message: string }[];
}

/** Response of POST /api/ai/nl2sql. */
export interface Nl2SqlResponse {
  ok: boolean;
  sql: string | null;
  rationale: string | null;
  rewrites: string[];
  explainOk: boolean | null;
  error: string | null;
}

/** Response of POST /api/ai/interpret. */
export interface InterpretResponse {
  ok: boolean;
  summary?: string;
  highlights?: string[];
  sampledRows?: number;
  error?: string;
}

/** One anomaly from POST /api/ai/anomalies. */
export interface AnomalyItem {
  kind: "statistical" | "operational" | "semantic";
  column: string | null;
  severity: "info" | "warn" | "high";
  description: string;
}

/** Response of POST /api/ai/anomalies. */
export interface AnomaliesResponse {
  ok: boolean;
  anomalies?: AnomalyItem[];
  stats?: Record<string, unknown>;
  error?: string;
}

/** Response of POST /api/ai/suggest. */
export interface SuggestResponse {
  ok: boolean;
  suggestions?: { sql: string; rationale: string }[];
  error?: string;
}

/** Response of POST /api/ai/chart-insight. */
export interface ChartInsightResponse {
  ok: boolean;
  reading?: string;
  anomalies?: string[];
  error?: string;
}

/** Response of GET /api/permits/detail. */
export interface PermitDetailResponse {
  ok: boolean;
  permit: Record<string, unknown> | null;
  addenda: Record<string, unknown>[];
  firms: Record<string, unknown>[];
  source: { permit: string; addenda: string; firms: string };
  errors: string[];
}

/** Response of POST /api/vetting/contractor. */
export interface VettingResponse {
  ok: boolean;
  profile: Record<string, unknown>[];
  recentPermits: Record<string, unknown>[];
  metrics: Record<string, unknown>;
  sql: string;
  error?: string;
}

/** Response of POST /api/permits/lookup. */
export interface PermitsResponse {
  ok: boolean;
  mode: string;
  count: number;
  rows: Record<string, unknown>[];
  error?: string;
  durationMs: number;
}

/** Response of GET /api/diagnostics. */
export interface DiagnosticsResponse {
  status: "ok" | "degraded" | "fail";
  catalog: Record<string, unknown> & { status?: string };
  ingestion: { mode: string; evidence: string; lastLoadedAt: string | null; ageHours: number | null };
  tables: { expected: number; live: number | null; missing: string[]; totalRowsAtDiscovery: number };
  probe: Record<string, unknown>;
  recentQueries: { total: number; failed: number; avgDurationMs: number | null };
  interpretation: string[];
}

/**
 * Cross-island event names (workbench <-> assistant panel on /workbench).
 * Dispatched on `window` as CustomEvent.
 */
export const WAREHOUSE_EVENTS = {
  /** detail: { sql: string; autoRun?: boolean } — populate the workbench editor. */
  runSql: "warehouse:run-sql",
  /** detail: { text: string } — send a message through the assistant. */
  askAgent: "warehouse:ask-agent",
} as const;

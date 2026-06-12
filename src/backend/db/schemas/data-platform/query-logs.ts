/**
 * @fileoverview `query_logs` table — mirrored D1 logging layer for the
 * data-platform routes and agent tools.
 *
 * Every R2 SQL execution, SODA lookup, and diagnostics probe writes one row
 * here (fire-and-forget via `ctx.waitUntil`), so the dashboard and /health
 * can answer "is data flowing and queryable?" from local history without
 * re-hitting the warehouse.
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

/** Human-readable description of the `query_logs` table for the docs UI. */
export const QUERY_LOGS_TABLE_DESCRIPTION =
  "Structured log of every data-platform operation (R2 SQL query, SODA permit lookup, catalog probe, AI provider call) with timing, scan metrics, and success/failure detail.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const QUERY_LOGS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key, generated via crypto.randomUUID().",
  source: "Operation family: r2sql | soda | catalog | ai | diagnostics.",
  operation: "Specific operation (e.g. query, describe, lookup_address, nl2sql).",
  ok: "1 when the operation succeeded, 0 otherwise.",
  status: "Upstream HTTP status code (0 for network failures).",
  duration_ms: "Wall-clock duration of the upstream round trip.",
  sql: "The executed SQL text (R2 SQL operations only).",
  request_id: "R2 SQL engine request id, when available.",
  rows_returned: "Number of rows returned to the caller.",
  files_scanned: "R2 SQL metric: Parquet files scanned.",
  bytes_scanned: "R2 SQL metric: compressed bytes scanned.",
  error: "First error message when ok = 0.",
  metadata: "JSON blob with operation-specific extras (guard rewrites, SODA URL, model id).",
  created_at: "Unix timestamp (seconds) when the operation completed.",
};

/** Drizzle table definition for `query_logs`. */
export const queryLogs = sqliteTable("query_logs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  source: text("source").notNull(),
  operation: text("operation").notNull(),
  ok: integer("ok", { mode: "boolean" }).notNull(),
  status: integer("status").notNull().default(0),
  durationMs: integer("duration_ms").notNull().default(0),
  sql: text("sql"),
  requestId: text("request_id"),
  rowsReturned: integer("rows_returned"),
  filesScanned: integer("files_scanned"),
  bytesScanned: integer("bytes_scanned"),
  error: text("error"),
  metadata: text("metadata", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertQueryLogSchema = createInsertSchema(queryLogs);
export const selectQueryLogSchema = createSelectSchema(queryLogs);
export type QueryLogEntry = typeof queryLogs.$inferSelect;
export type NewQueryLogEntry = typeof queryLogs.$inferInsert;

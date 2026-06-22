/**
 * @fileoverview `enrichment_runs` — tracks Workers-AI tagging batch jobs.
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const ENRICHMENT_RUNS_TABLE_DESCRIPTION =
  "Tracks Workers-AI permit-tagging jobs (sync/batch), their queue request id, status, and counts.";

export const ENRICHMENT_RUNS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key.",
  kind: "description | addenda | inspection.",
  status: "queued | running | done | failed.",
  request_id: "Workers AI batch queue request id.",
  external_reference: "Chunk reference to map results back.",
  model: "Model id.",
  counts: "JSON {permits, tags, chunks}.",
  created_at: "Unix ts.",
  updated_at: "Unix ts.",
};

export const enrichmentRuns = sqliteTable("enrichment_runs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  kind: text("kind").notNull().default("description"),
  status: text("status").notNull().default("queued"),
  requestId: text("request_id"),
  externalReference: text("external_reference"),
  model: text("model"),
  counts: text("counts", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const insertEnrichmentRunSchema = createInsertSchema(enrichmentRuns);
export const selectEnrichmentRunSchema = createSelectSchema(enrichmentRuns);
export type EnrichmentRun = typeof enrichmentRuns.$inferSelect;
export type NewEnrichmentRun = typeof enrichmentRuns.$inferInsert;

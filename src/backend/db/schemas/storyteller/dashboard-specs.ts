/**
 * @fileoverview `storyteller_dashboard_specs` — the rendered bespoke dashboard
 * spec per thread (versioned; draft|live|superseded).
 */

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const STORYTELLER_DASHBOARD_SPECS_TABLE_DESCRIPTION =
  "Per-thread declarative DashboardSpec (JSON) drawn by the spec-driven renderer; versioned, status draft|live|superseded.";

export const STORYTELLER_DASHBOARD_SPECS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key.",
  thread_id: "FK -> storyteller_threads.id.",
  plan_id: "FK -> storyteller_data_plans.id (provenance).",
  spec: "JSON DashboardSpec (ordered blocks + filters).",
  version: "Monotonic per thread.",
  status: "draft | live | superseded.",
  created_at: "Unix ts.",
  updated_at: "Unix ts.",
};

export const storytellerDashboardSpecs = sqliteTable(
  "storyteller_dashboard_specs",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    threadId: text("thread_id").notNull(),
    planId: text("plan_id"),
    spec: text("spec", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    version: integer("version").notNull().default(1),
    status: text("status").notNull().default("draft"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [index("storyteller_dashboard_specs_thread_idx").on(t.threadId, t.version)],
);

export const insertStorytellerDashboardSpecSchema = createInsertSchema(storytellerDashboardSpecs);
export const selectStorytellerDashboardSpecSchema = createSelectSchema(storytellerDashboardSpecs);
export type StorytellerDashboardSpec = typeof storytellerDashboardSpecs.$inferSelect;
export type NewStorytellerDashboardSpec = typeof storytellerDashboardSpecs.$inferInsert;

/**
 * @fileoverview `storyteller_data_plans` — the agent's evolving data plan per
 * thread (proposed -> approved -> superseded), versioned.
 */

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const STORYTELLER_DATA_PLANS_TABLE_DESCRIPTION =
  "Evolving agent data plan per thread; status proposed|approved|superseded; monotonic version.";

export const STORYTELLER_DATA_PLANS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key.",
  thread_id: "FK -> storyteller_threads.id.",
  message_id: "FK -> storyteller_messages.id (the turn that produced it).",
  plan: "JSON DataPlan (goals, intended blocks/queries).",
  status: "proposed | approved | superseded.",
  version: "Monotonic per thread.",
  created_at: "Unix ts.",
};

export const storytellerDataPlans = sqliteTable(
  "storyteller_data_plans",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    threadId: text("thread_id").notNull(),
    messageId: text("message_id"),
    plan: text("plan", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("proposed"),
    version: integer("version").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [index("storyteller_data_plans_thread_idx").on(t.threadId, t.version)],
);

export const insertStorytellerDataPlanSchema = createInsertSchema(storytellerDataPlans);
export const selectStorytellerDataPlanSchema = createSelectSchema(storytellerDataPlans);
export type StorytellerDataPlan = typeof storytellerDataPlans.$inferSelect;
export type NewStorytellerDataPlan = typeof storytellerDataPlans.$inferInsert;

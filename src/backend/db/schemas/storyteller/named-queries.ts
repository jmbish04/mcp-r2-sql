/**
 * @fileoverview `storyteller_named_queries` — reusable guarded R2 SQL templates
 * referenced by dashboard spec blocks (global templates have null thread_id).
 */

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const STORYTELLER_NAMED_QUERIES_TABLE_DESCRIPTION =
  "Reusable guarded R2 SQL templates referenced by dashboard spec blocks; thread_id null = global template (e.g. the 8 validated homeowner use cases).";

export const STORYTELLER_NAMED_QUERIES_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "nq_ id, referenced by spec blocks.",
  thread_id: "FK -> storyteller_threads.id, or null for a global template.",
  label: "Human label.",
  sql: "R2 SQL string (guarded before execution).",
  params: "JSON {name: {type, default}} for filter binding.",
  created_at: "Unix ts.",
};

export const storytellerNamedQueries = sqliteTable(
  "storyteller_named_queries",
  {
    id: text("id").primaryKey().$defaultFn(() => `nq_${crypto.randomUUID()}`),
    threadId: text("thread_id"),
    label: text("label").notNull(),
    sql: text("sql").notNull(),
    params: text("params", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [index("storyteller_named_queries_thread_idx").on(t.threadId)],
);

export const insertStorytellerNamedQuerySchema = createInsertSchema(storytellerNamedQueries);
export const selectStorytellerNamedQuerySchema = createSelectSchema(storytellerNamedQueries);
export type StorytellerNamedQuery = typeof storytellerNamedQueries.$inferSelect;
export type NewStorytellerNamedQuery = typeof storytellerNamedQueries.$inferInsert;

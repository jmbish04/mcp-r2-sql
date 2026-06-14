/**
 * @fileoverview `storyteller_thread_filters` — the per-thread data-scope filter
 * state; the active row drives the live dashboard (filters bind into queries).
 */

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const STORYTELLER_THREAD_FILTERS_TABLE_DESCRIPTION =
  "Per-thread data-scope filter state; the is_active row drives the live dashboard. Filters bind by param name into block queries.";

export const STORYTELLER_THREAD_FILTERS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key.",
  thread_id: "FK -> storyteller_threads.id.",
  filters: "JSON FilterState (date range, permit type, status, neighborhood, geo bbox, cost band, text, tags).",
  is_active: "1 = the live filter set for the thread.",
  label: "Optional named saved view.",
  created_at: "Unix ts.",
};

export const storytellerThreadFilters = sqliteTable(
  "storyteller_thread_filters",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    threadId: text("thread_id").notNull(),
    filters: text("filters", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    label: text("label"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [index("storyteller_thread_filters_thread_idx").on(t.threadId)],
);

export const insertStorytellerThreadFilterSchema = createInsertSchema(storytellerThreadFilters);
export const selectStorytellerThreadFilterSchema = createSelectSchema(storytellerThreadFilters);
export type StorytellerThreadFilter = typeof storytellerThreadFilters.$inferSelect;
export type NewStorytellerThreadFilter = typeof storytellerThreadFilters.$inferInsert;

/**
 * @fileoverview `storyteller_threads` — one row per homeowner goal/conversation.
 * The frontend toggles between threads to switch the whole bespoke experience.
 */

import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const STORYTELLER_THREADS_TABLE_DESCRIPTION =
  "One row per homeowner goal/conversation thread; goal_category references config_options(goal_category).value. Drives the thread switcher and per-thread bespoke dashboards.";

export const STORYTELLER_THREADS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "thr_ UUID primary key.",
  title: "Agent-generated, user-editable title.",
  goal_category: "config_options(goal_category).value (data-driven, not a hardcoded enum).",
  goal_summary: "One-line resolved goal.",
  address: "Subject property address, if any.",
  parcel_block_lot: "Normalized APN (block/lot), if resolved.",
  lat: "Geocoded latitude of the subject, if any.",
  lng: "Geocoded longitude of the subject, if any.",
  status: "active | archived | pinned.",
  last_message_at: "Unix ts of the latest message (switcher ordering).",
  created_at: "Unix ts created.",
  updated_at: "Unix ts last modified.",
};

export const storytellerThreads = sqliteTable("storyteller_threads", {
  id: text("id").primaryKey().$defaultFn(() => `thr_${crypto.randomUUID()}`),
  title: text("title").notNull().default("New goal"),
  goalCategory: text("goal_category"),
  goalSummary: text("goal_summary"),
  address: text("address"),
  parcelBlockLot: text("parcel_block_lot"),
  lat: real("lat"),
  lng: real("lng"),
  status: text("status").notNull().default("active"),
  lastMessageAt: integer("last_message_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const insertStorytellerThreadSchema = createInsertSchema(storytellerThreads);
export const selectStorytellerThreadSchema = createSelectSchema(storytellerThreads);
export type StorytellerThread = typeof storytellerThreads.$inferSelect;
export type NewStorytellerThread = typeof storytellerThreads.$inferInsert;

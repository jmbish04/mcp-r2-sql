/**
 * @fileoverview `agentic_sf_context` — pre-seeded expert domain context the
 * agent injects to stay razor-focused (CRUD-editable in the config panel).
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const AGENTIC_SF_CONTEXT_TABLE_DESCRIPTION =
  "Pre-seeded SF DBI domain context (regulatory navigation, permit process, costs, contractor vetting, corruption red-flags, inspector culture, timelines, neighborhoods, data signals, homeowner actions) the agent injects for grounding; editable, enable/disable.";

export const AGENTIC_SF_CONTEXT_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key.",
  category: "Context category.",
  topic: "Short title.",
  content: "Expert explanation injected into agent reasoning.",
  data_signals: "JSON/text: which warehouse tables/columns/metrics reveal this.",
  homeowner_action: "Recommended homeowner action.",
  priority: "1-5 impact weight.",
  enabled: "1 = injected; 0 = retired.",
  created_at: "Unix ts.",
  updated_at: "Unix ts.",
};

export const agenticSfContext = sqliteTable("agentic_sf_context", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  category: text("category").notNull(),
  topic: text("topic").notNull(),
  content: text("content").notNull(),
  dataSignals: text("data_signals"),
  homeownerAction: text("homeowner_action"),
  priority: integer("priority").notNull().default(3),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const insertAgenticSfContextSchema = createInsertSchema(agenticSfContext);
export const selectAgenticSfContextSchema = createSelectSchema(agenticSfContext);
export type AgenticSfContext = typeof agenticSfContext.$inferSelect;
export type NewAgenticSfContext = typeof agenticSfContext.$inferInsert;

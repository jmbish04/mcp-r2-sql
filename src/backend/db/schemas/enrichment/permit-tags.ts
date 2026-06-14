/**
 * @fileoverview `permit_tags` — Workers-AI free-text enrichment output mapping
 * permits to categories (windows:inkind, planning:slope_25pct, post_disaster:fire, …).
 */

import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const PERMIT_TAGS_TABLE_DESCRIPTION =
  "Workers-AI free-text enrichment output: category tags extracted from permit descriptions / addenda comments / inspection comments, mapped to permit numbers. Consumed as a first-class filter.";

export const PERMIT_TAGS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key.",
  permit_number: "The tagged permit number.",
  category: "Taxonomy tag, e.g. windows:street_facing, planning:slope_25pct, post_disaster:fire, phased_build.",
  source: "description | addenda | inspection.",
  run_id: "enrichment_runs.id that produced this tag.",
  model: "Model id used (e.g. @cf/moonshotai/kimi-k2.6).",
  confidence: "Optional model confidence.",
  created_at: "Unix ts.",
};

export const permitTags = sqliteTable(
  "permit_tags",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    permitNumber: text("permit_number").notNull(),
    category: text("category").notNull(),
    source: text("source").notNull().default("description"),
    runId: text("run_id"),
    model: text("model"),
    confidence: real("confidence"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("permit_tags_uq").on(t.permitNumber, t.category, t.source),
    index("permit_tags_category_idx").on(t.category),
    index("permit_tags_permit_idx").on(t.permitNumber),
  ],
);

export const insertPermitTagSchema = createInsertSchema(permitTags);
export const selectPermitTagSchema = createSelectSchema(permitTags);
export type PermitTag = typeof permitTags.$inferSelect;
export type NewPermitTag = typeof permitTags.$inferInsert;

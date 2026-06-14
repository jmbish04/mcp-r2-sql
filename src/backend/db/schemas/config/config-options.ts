/**
 * @fileoverview `config_options` — a generic, admin-editable registry of
 * list/enum configurations (one row per option, grouped by `config_key`).
 *
 * Replaces hardcoded frontend enums (storyteller goal categories, vetting
 * roles, permit trade-category / status / neighborhood badge colors, …) with
 * D1-backed, API-served, self-admin-manageable options that can be relabeled,
 * recolored, reordered, added, or marked inactive without a deploy.
 *
 * One table + one API + one admin page handles every list configuration:
 * group by `config_key`, render the options ordered by `sort_order`.
 */

import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

/** Human-readable description of the `config_options` table for the docs UI. */
export const CONFIG_OPTIONS_TABLE_DESCRIPTION =
  "Generic registry of admin-editable list/enum configurations grouped by config_key (e.g. goal_category, vetting_role, permit_trade_category, permit_status, sf_neighborhood). Powers data-driven dropdowns and badge colors with an active/inactive toggle — no redeploy needed.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const CONFIG_OPTIONS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key.",
  config_key: "The configuration group, e.g. 'goal_category', 'vetting_role', 'permit_trade_category'.",
  value: "Stable slug stored on records / sent in API calls (unique within a config_key).",
  label: "Human-facing display text.",
  description: "Optional longer explanation shown in admin / tooltips.",
  color: "Optional badge background color (hex or CSS color/token).",
  text_color: "Optional badge text color (e.g. white on a black 'building' badge).",
  sort_order: "Ascending display order within the group.",
  active: "1 = selectable/shown; 0 = retired (kept for referential history).",
  metadata: "JSON for group-specific extras (icon, parent, weight, etc.).",
  created_at: "Unix timestamp (seconds) when created.",
  updated_at: "Unix timestamp (seconds) of last modification.",
};

/** Drizzle table definition for `config_options`. */
export const configOptions = sqliteTable(
  "config_options",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    configKey: text("config_key").notNull(),
    value: text("value").notNull(),
    label: text("label").notNull(),
    description: text("description"),
    color: text("color"),
    textColor: text("text_color"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    metadata: text("metadata", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("config_options_key_value_uq").on(t.configKey, t.value)],
);

export const insertConfigOptionSchema = createInsertSchema(configOptions);
export const selectConfigOptionSchema = createSelectSchema(configOptions);
export type ConfigOption = typeof configOptions.$inferSelect;
export type NewConfigOption = typeof configOptions.$inferInsert;

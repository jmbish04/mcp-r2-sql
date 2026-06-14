/**
 * @fileoverview DashboardSpec types + server-side validator + filter binding +
 * query resolution. The agent emits a spec; this validates it against the
 * block/chart allowlist and guards all SQL before it ever executes.
 */

import { guardSql } from "@/backend/data-platform";

/** Chart families (full shadcn Recharts catalog + derived presets). */
export const CHART_FAMILIES = [
  "area", "area_stacked", "area_step",
  "bar", "bar_horizontal", "bar_grouped", "bar_stacked", "bar_labeled",
  "line", "line_multi", "line_step",
  "pie", "donut", "radar", "radial", "scatter",
  "histogram", "permit_lifecycle", "ranked_bar",
] as const;
export type ChartFamily = (typeof CHART_FAMILIES)[number];

export const BLOCK_TYPES = [
  "narrative", "kpi_cards", "chart", "map", "permits_table",
  "gantt", "timeline_steps", "table", "callout", "custom",
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export type QueryRef =
  | { mode: "named"; queryId: string; bind?: Record<string, string> }
  | { mode: "inline"; sql: string; bind?: Record<string, string> };

export interface FilterDecl {
  id: string;
  kind: "date_range" | "select" | "multiselect" | "geo_bbox" | "text" | "tags";
  label: string;
  param: string;
  options?: { value: string; label: string }[];
  default?: unknown;
}

export interface DashboardSpec {
  version: 1;
  title: string;
  subtitle?: string;
  goal_category?: string;
  filters: FilterDecl[];
  blocks: Array<Record<string, unknown> & { id: string; type: BlockType }>;
}

/** Throw if the spec violates the allowlist; returns the spec on success. */
export function validateSpec(spec: unknown): DashboardSpec {
  const s = spec as DashboardSpec;
  if (!s || typeof s !== "object") throw new Error("spec must be an object");
  if (s.version !== 1) throw new Error("spec.version must be 1");
  if (typeof s.title !== "string" || !s.title) throw new Error("spec.title required");
  if (!Array.isArray(s.blocks)) throw new Error("spec.blocks must be an array");
  s.filters = Array.isArray(s.filters) ? s.filters : [];
  for (const b of s.blocks) {
    if (!b || typeof b !== "object" || !b.id) throw new Error("each block needs an id");
    if (!BLOCK_TYPES.includes(b.type)) throw new Error(`unknown block type: ${b.type}`);
    if (b.type === "chart") {
      const fam = (b as { chart?: string }).chart;
      if (!fam || !CHART_FAMILIES.includes(fam as ChartFamily)) throw new Error(`unknown chart family: ${fam}`);
    }
    if (b.type === "custom") {
      const render = (b as { render?: string }).render;
      if (render !== "vega" && render !== "svg") throw new Error("custom block needs render: vega|svg");
    }
    // Guard inline SQL up front so invalid/unsafe queries never persist.
    const q = (b as { query?: QueryRef }).query;
    if (q && q.mode === "inline") {
      const g = guardSql(q.sql);
      if (!g.allowed) throw new Error(`block ${b.id} inline SQL rejected: ${g.reason}`);
    }
  }
  return s;
}

/** Escape a value for inline use in an R2 SQL literal. */
function sqlLiteral(value: unknown, type: "string" | "number" | "date" | "enum"): string {
  if (type === "number") {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error("invalid number param");
    return String(n);
  }
  // string | date | enum -> single-quoted, escaped
  const s = String(value ?? "");
  return `'${s.replace(/'/g, "''")}'`;
}

/**
 * Replace `:name` placeholders in `sql` with escaped literals from `values`,
 * using the template's declared param types. Unknown/missing params fall back to
 * the declared default. `:permit_numbers` style IN-lists accept comma-joined,
 * pre-quoted values.
 */
export function bindParams(
  sql: string,
  paramDefs: Record<string, { type: "string" | "number" | "date" | "enum"; default?: string | number }>,
  values: Record<string, unknown> = {},
): string {
  return sql.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_m, name: string) => {
    const def = paramDefs[name];
    if (!def) return `:${name}`; // leave unknown tokens (none expected)
    const provided = values[name] ?? def.default ?? "";
    // IN-list convention: param literally named *_numbers / *_list holds a raw,
    // pre-escaped, comma-joined fragment (built server-side, never user raw).
    if (name.endsWith("_numbers") || name.endsWith("_list")) {
      const raw = String(provided || "''");
      return raw;
    }
    return sqlLiteral(provided, def.type);
  });
}

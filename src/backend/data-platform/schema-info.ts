/**
 * @fileoverview Helpers over the discovered warehouse schema
 * (`schema-data.ts`, generated from docs/cslb-schema.json).
 *
 * Provides: prompt-ready schema rendering for NL->SQL, table-name validation
 * for the schema-browser endpoints, and quick aggregate facts for the
 * dashboard/diagnostics.
 */

import { DISCOVERED_SCHEMA, type DiscoveredTable } from "./schema-data";

export { DISCOVERED_SCHEMA };

/** Fully-qualified `namespace.table` names for every discovered table. */
export function qualifiedTableNames(): string[] {
  return Object.keys(DISCOVERED_SCHEMA.tables).map((t) => `${DISCOVERED_SCHEMA.namespace}.${t}`);
}

/** Look up a discovered table by bare or qualified name; null when unknown. */
export function findTable(name: string): { table: string; info: DiscoveredTable } | null {
  const bare = name.includes(".") ? name.split(".").pop()! : name;
  const info = DISCOVERED_SCHEMA.tables[bare];
  return info ? { table: bare, info } : null;
}

/** Total row count across all discovered tables (from Iceberg snapshots). */
export function totalRows(): number {
  return Object.values(DISCOVERED_SCHEMA.tables).reduce((acc, t) => acc + t.total_records, 0);
}

/** Most recent Iceberg commit timestamp (ms) across all tables, or null. */
export function lastLoadedAtMs(): number | null {
  const ms = Object.values(DISCOVERED_SCHEMA.tables)
    .map((t) => t.last_updated_ms ?? 0)
    .reduce((a, b) => Math.max(a, b), 0);
  return ms || null;
}

/**
 * Render the warehouse schema as compact text for LLM system prompts.
 * Includes row counts so the model can pick sensible tables, and trims
 * column lists to name+type (no doc strings — token budget).
 */
export function renderSchemaForPrompt(): string {
  const ns = DISCOVERED_SCHEMA.namespace;
  const sections = Object.entries(DISCOVERED_SCHEMA.tables).map(([name, t]) => {
    const cols = t.columns.map((c) => `${c.name} ${c.type}`).join(", ");
    return `TABLE ${ns}.${name} (${t.total_records} rows)\n  ${cols}`;
  });
  return sections.join("\n\n");
}

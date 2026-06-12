/**
 * @fileoverview R2 SQL query guard — validates and normalizes SQL before it
 * is sent to the R2 SQL engine.
 *
 * Enforced rules (mirrored in the NL->SQL system prompt):
 *  - Read-only: only SELECT / WITH / SHOW / DESCRIBE / EXPLAIN. DML/DDL rejected.
 *  - Single statement only (no `;`-chained statements).
 *  - A LIMIT is always present on SELECT/WITH: injected at 500 when missing,
 *    capped at 10,000 when larger.
 *  - OFFSET is rejected (R2 SQL does not support it — cursor-paginate instead).
 *  - Window functions (OVER) are rejected.
 *  - `func(DISTINCT ...)` aggregate forms are rejected (use approx_distinct()).
 *  - `map_entries()` is rejected (known engine bug — use map_keys/map_values).
 *
 * The guard is intentionally string/regex based ("quick and dirty but real"):
 * R2 SQL itself is the final validator; the guard's job is to fail fast with
 * actionable messages and to stop write attempts before they leave the Worker.
 */

import type { GuardResult } from "./types";

/** Default LIMIT injected when a SELECT/WITH has none. */
export const DEFAULT_LIMIT = 500;
/** Hard cap on LIMIT (R2 SQL maximum). */
export const MAX_LIMIT = 10_000;

/** Statement-leading keywords that are allowed (read-only surface). */
const ALLOWED_KINDS = ["select", "with", "show", "describe", "explain"] as const;

/** Forbidden keywords anywhere in the statement (DML/DDL). */
const FORBIDDEN = /\b(insert|update|delete|create|drop|alter|truncate|merge|grant|revoke|vacuum|copy|call|set)\b/i;

/** Strip line (`-- ...`) and block (`/* ... *\/`) comments so keyword checks
 * cannot be smuggled past the guard inside comments. */
function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
}

/**
 * Validate and normalize a SQL statement for R2 SQL execution.
 *
 * @param rawSql - The user/AI-provided SQL text.
 * @returns A {@link GuardResult}; when `allowed` is true, run `result.sql`.
 *
 * @example
 * const g = guardSql("SELECT * FROM sf_dbi.building_permits");
 * // g.allowed === true, g.sql ends with "LIMIT 500", g.rewrites = ["limit-injected"]
 */
export function guardSql(rawSql: string): GuardResult {
  const rewrites: string[] = [];
  let sql = stripComments(rawSql).trim();

  // Drop a single trailing semicolon, then reject genuine multi-statements.
  sql = sql.replace(/;\s*$/, "").trim();
  if (sql.includes(";")) {
    return reject(sql, "Multiple statements are not allowed — submit one query at a time.");
  }
  if (!sql) {
    return reject(sql, "Empty query.");
  }

  const kindMatch = sql.match(/^([a-zA-Z]+)/);
  const kind = (kindMatch?.[1] ?? "").toLowerCase() as GuardResult["kind"];
  if (!ALLOWED_KINDS.includes(kind as (typeof ALLOWED_KINDS)[number])) {
    return reject(
      sql,
      `Only read queries are allowed (SELECT / WITH / SHOW / DESCRIBE / EXPLAIN). Got: "${kindMatch?.[1] ?? "?"}".`,
    );
  }

  // Forbidden write keywords anywhere — except EXPLAIN'd read statements still
  // cannot contain them either, so the check is unconditional. `WITH ... INSERT`
  // style write CTE chains are caught here too.
  const forbidden = sql.match(FORBIDDEN);
  if (forbidden) {
    return reject(sql, `Write/DDL keyword "${forbidden[1].toUpperCase()}" is not allowed — R2 SQL access here is read-only.`);
  }

  if (/\boffset\b/i.test(sql)) {
    return reject(sql, "OFFSET is not supported by R2 SQL. Cursor-paginate instead: WHERE <sort_col> > <last_value> ORDER BY <sort_col> LIMIT n.");
  }
  if (/\bover\s*\(/i.test(sql)) {
    return reject(sql, "Window functions (OVER) are not supported by R2 SQL. Aggregate with GROUP BY, or pre-compute in a batch engine.");
  }
  if (/\bmap_entries\s*\(/i.test(sql)) {
    return reject(sql, "map_entries() fails on stored map columns (engine bug 80001). Use map_keys(), map_values(), or map_extract() instead.");
  }
  const distinctAgg = sql.match(/\b([a-zA-Z_]+)\s*\(\s*distinct\b/i);
  if (distinctAgg) {
    return reject(sql, `${distinctAgg[1].toUpperCase()}(DISTINCT ...) is not supported by R2 SQL. Use approx_distinct(col) for distinct counts.`);
  }

  // LIMIT handling — only meaningful for row-returning statements.
  if (kind === "select" || kind === "with") {
    const limitMatch = sql.match(/\blimit\s+(\d+)\s*$/i);
    if (!limitMatch) {
      sql = `${sql} LIMIT ${DEFAULT_LIMIT}`;
      rewrites.push(`limit-injected:${DEFAULT_LIMIT}`);
    } else if (Number(limitMatch[1]) > MAX_LIMIT) {
      sql = sql.replace(/\blimit\s+\d+\s*$/i, `LIMIT ${MAX_LIMIT}`);
      rewrites.push(`limit-capped:${MAX_LIMIT}`);
    }
  }

  return { allowed: true, sql, rewrites, kind };
}

/** Build a rejection result with a stable shape. */
function reject(sql: string, reason: string): GuardResult {
  return { allowed: false, sql, reason, rewrites: [], kind: "unknown" };
}

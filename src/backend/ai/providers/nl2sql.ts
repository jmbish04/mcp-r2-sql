/**
 * @fileoverview NL->SQL provider — turns a natural-language question into a
 * guardrail-compliant R2 SQL statement grounded in the discovered warehouse
 * schema (docs/cslb-schema.json).
 *
 * Pipeline: prompt (schema + R2 SQL dialect rules + few-shots) → structured
 * output {sql, rationale} → local guard validation → free EXPLAIN against the
 * live engine. The SQL is returned to the caller for display/confirmation —
 * this module never executes the real query itself.
 */

import { z } from "zod";

import { generateStructuredOutput } from "@/backend/ai/providers/index";
import { getR2SqlToken, guardSql, queryR2Sql, renderSchemaForPrompt } from "@/backend/data-platform";

/** Structured model output for an NL->SQL draft. */
const Nl2SqlOutput = z.object({
  sql: z.string().describe("A single R2 SQL read query answering the question. No trailing semicolon."),
  rationale: z.string().describe("One or two sentences: which tables/columns were used and why."),
});

/** Result of drafting SQL from a natural-language question. */
export interface Nl2SqlResult {
  ok: boolean;
  /** Guard-normalized SQL (LIMIT injected/capped) — run this one. */
  sql: string | null;
  rationale: string | null;
  /** Guard rewrites applied (e.g. limit-injected:500). */
  rewrites: string[];
  /** True when the free EXPLAIN validated the query against the live engine. */
  explainOk: boolean | null;
  error: string | null;
}

/** Build the NL->SQL system prompt (template literal per repo AI-prompt rules). */
function systemPrompt(): string {
  return `You translate analyst questions into R2 SQL queries over a San Francisco DBI (Department of Building Inspection) Iceberg warehouse.

WAREHOUSE SCHEMA (exact table and column names — use only these):
${renderSchemaForPrompt()}

R2 SQL DIALECT RULES (hard constraints):
- Read-only: a single SELECT or WITH query. Never INSERT/UPDATE/DELETE/CREATE/ALTER/DROP.
- FROM must use namespace.table (e.g. sf_dbi.building_permits).
- Always end with LIMIT (default 500, max 10000).
- NO OFFSET. NO window functions (no OVER clause). NO func(DISTINCT ...) — use approx_distinct(col) for distinct counts.
- SELECT DISTINCT, JOINs, subqueries, UNION/INTERSECT/EXCEPT, CTEs are supported.
- Map columns: use map_keys/map_values/map_extract, never map_entries.
- Dates: filed_date/issued_date etc. are timestamps; compare with TIMESTAMP literals like '2024-01-01T00:00:00Z' or use date functions (date_trunc, to_date, EXTRACT).
- String matching: use ILIKE for case-insensitive matching (e.g. firm_name ILIKE '%smith%').

DOMAIN NOTES:
- Contractor/architect/engineer lookups use sf_dbi.permit_contractors (firm_name, license1 = CSLB license number, role).
- Permit history for an address spans building_permits / plumbing_permits / electrical_permits (street_number, street_name, street_suffix).
- Complaints live in sf_dbi.complaints; inspections in building_inspections / plumbing_inspections.
- ingested_at is the warehouse load time; data_as_of is upstream DataSF freshness.

EXAMPLES:
Q: how many building permits were filed each year since 2020?
SQL: SELECT EXTRACT(YEAR FROM filed_date) AS yr, COUNT(*) AS n FROM sf_dbi.building_permits WHERE filed_date >= '2020-01-01T00:00:00Z' GROUP BY EXTRACT(YEAR FROM filed_date) ORDER BY yr LIMIT 100

Q: top 10 contractors by number of permits
SQL: SELECT firm_name, license1, COUNT(*) AS permits FROM sf_dbi.permit_contractors WHERE role ILIKE '%contractor%' GROUP BY firm_name, license1 ORDER BY permits DESC LIMIT 10

Q: distinct neighborhoods with high-value building permits
SQL: SELECT DISTINCT neighborhoods_analysis_boundaries FROM sf_dbi.building_permits WHERE is_high_value = 'true' LIMIT 200

Return only the JSON object with "sql" and "rationale".`;
}

/**
 * Draft a guard-validated SQL query from a natural-language question.
 *
 * @param env - Worker bindings (AI + R2 SQL vars).
 * @param question - The analyst's natural-language question.
 * @param opts.skipExplain - Skip the live EXPLAIN check (e.g. when the
 *        R2_SQL_TOKEN is not yet provisioned). Guard validation still runs.
 */
export async function nlToSql(env: Env, question: string, opts?: { skipExplain?: boolean }): Promise<Nl2SqlResult> {
  let draft: z.infer<typeof Nl2SqlOutput>;
  try {
    draft = await generateStructuredOutput(env, {
      messages: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: question },
      ],
      schema: Nl2SqlOutput,
      schemaName: "nl2sql_draft",
      temperature: 0.1,
    });
  } catch (err) {
    return { ok: false, sql: null, rationale: null, rewrites: [], explainOk: null, error: `NL->SQL generation failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  const guard = guardSql(draft.sql);
  if (!guard.allowed) {
    return { ok: false, sql: draft.sql, rationale: draft.rationale, rewrites: [], explainOk: null, error: `Drafted SQL rejected by guard: ${guard.reason}` };
  }

  if (opts?.skipExplain || !(await getR2SqlToken(env))) {
    return { ok: true, sql: guard.sql, rationale: draft.rationale, rewrites: guard.rewrites, explainOk: null, error: null };
  }

  // EXPLAIN is free (no bytes scanned) — validate against the live engine.
  const explain = await queryR2Sql(env, `EXPLAIN ${guard.sql}`);
  return {
    ok: explain.ok,
    sql: guard.sql,
    rationale: draft.rationale,
    rewrites: guard.rewrites,
    explainOk: explain.ok,
    error: explain.ok ? null : `EXPLAIN failed: ${explain.errors[0]?.message ?? "unknown engine error"}`,
  };
}

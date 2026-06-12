/**
 * @fileoverview Suggested-next-queries provider — given the current query
 * (and optionally its result shape), proposes 3-5 ready-to-run follow-up
 * R2 SQL queries with one-line rationales (MODEL_DRAFT family).
 *
 * Every suggestion is passed through the local query guard; suggestions the
 * guard rejects are dropped, so callers can run any returned SQL directly.
 */

import { z } from "zod";

import { generateStructuredOutput } from "@/backend/ai/providers/index";
import { guardSql, renderSchemaForPrompt } from "@/backend/data-platform";

const SuggestOutput = z.object({
  suggestions: z.array(
    z.object({
      sql: z.string().describe("A complete, runnable R2 SQL read query (single statement, with LIMIT)."),
      rationale: z.string().describe("One line: why this is a useful next step."),
    }),
  ).describe("3-5 follow-up queries."),
});

/** A guard-validated follow-up query suggestion. */
export interface QuerySuggestion {
  sql: string;
  rationale: string;
}

/**
 * Propose follow-up queries for the analyst's current exploration.
 *
 * @param env - Worker bindings (AI binding).
 * @param input - Current SQL plus optional result context (column names, row count).
 * @returns 0-5 guard-validated suggestions (invalid drafts are dropped).
 */
export async function suggestNextQueries(
  env: Env,
  input: { sql: string; columns?: string[]; rowCount?: number },
): Promise<QuerySuggestion[]> {
  const out = await generateStructuredOutput(env, {
    messages: [
      {
        role: "system",
        content: `You suggest follow-up analytical queries over a San Francisco DBI Iceberg warehouse queried via R2 SQL.

WAREHOUSE SCHEMA:
${renderSchemaForPrompt()}

R2 SQL RULES: single read-only SELECT/WITH per suggestion; FROM namespace.table; always include LIMIT (max 10000); no OFFSET; no window functions; no func(DISTINCT ...) — use approx_distinct(); JOINs/subqueries/CTEs/UNION are fine; ILIKE for fuzzy text.

Suggest queries that deepen, pivot, or sanity-check the analyst's current query: drill into a dominant group, compare across time, join a related table, or check data quality. Reply with the JSON object only.`,
      },
      {
        role: "user",
        content: `Current query:
${input.sql}

Result context: ${input.rowCount ?? "?"} rows; columns: ${(input.columns ?? []).join(", ") || "unknown"}.

Propose 3-5 follow-up queries.`,
      },
    ],
    schema: SuggestOutput,
    schemaName: "next_queries",
    temperature: 0.4,
  });

  const valid: QuerySuggestion[] = [];
  for (const s of out.suggestions) {
    const guard = guardSql(s.sql);
    if (guard.allowed) valid.push({ sql: guard.sql, rationale: s.rationale });
  }
  return valid;
}

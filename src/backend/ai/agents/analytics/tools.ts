/**
 * @fileoverview Analytics tool catalog for the ChatBroker agent.
 *
 * Exposes the data-platform capabilities as AI SDK tools so the chat agent
 * can draft, validate, run, and interpret R2 SQL queries, look up SF permits,
 * and vet contractors — all server-side inside the Durable Object.
 *
 * Design notes:
 *  - Every SQL execution goes through `guardSql` (read-only + LIMIT
 *    enforcement) — the model cannot bypass the guard.
 *  - Tool results are returned as plain JSON-serializable objects; large row
 *    sets are truncated to keep the conversation context bounded.
 *  - WORKER_LOADERS deviation: the planned dynamic-Worker sandbox is not used
 *    here — every tool is a typed, pre-audited server function, so there is
 *    no untrusted code to isolate. Noted in AGENTS.md.
 */

import { tool } from "ai";
import { z } from "zod";

import { detectAnomalies } from "@/backend/ai/providers/anomaly";
import { interpretResults } from "@/backend/ai/providers/interpret";
import { nlToSql } from "@/backend/ai/providers/nl2sql";
import { suggestNextQueries } from "@/backend/ai/providers/suggest";
import {
  DISCOVERED_SCHEMA,
  findTable,
  guardSql,
  logOperation,
  lookupPermitByNumber,
  lookupPermitsByAddress,
  queryR2Sql,
  vetContractor,
} from "@/backend/data-platform";

/** Max rows returned to the model from run_query (UI gets full sets via /api/r2/query). */
const TOOL_ROW_CAP = 100;

/**
 * Build the analytics tool set bound to this Worker's env.
 *
 * @param env - Worker bindings available inside the ChatBroker DO.
 * @returns Tool map for `streamText({ tools })`.
 */
export function buildAnalyticsTools(env: Env) {
  return {
    describe_schema: tool({
      description:
        "Get the warehouse schema. Without arguments returns all table names with row counts; with a table name returns its full column list.",
      inputSchema: z.object({
        table: z.string().optional().describe("Optional bare or namespace-qualified table name (e.g. sf_dbi.building_permits)."),
      }),
      execute: async ({ table }) => {
        if (!table) {
          return {
            namespace: DISCOVERED_SCHEMA.namespace,
            tables: Object.entries(DISCOVERED_SCHEMA.tables).map(([name, t]) => ({
              name: `${DISCOVERED_SCHEMA.namespace}.${name}`,
              rows: t.total_records,
            })),
          };
        }
        const found = findTable(table);
        if (!found) return { error: `Unknown table: ${table}` };
        return {
          table: `${DISCOVERED_SCHEMA.namespace}.${found.table}`,
          rows: found.info.total_records,
          columns: found.info.columns,
        };
      },
    }),

    nl_to_sql: tool({
      description:
        "Draft a guard-validated R2 SQL query from a natural-language question. Returns the SQL and rationale — show the SQL to the user, then call run_query to execute it.",
      inputSchema: z.object({ question: z.string().describe("The analyst's question in natural language.") }),
      execute: async ({ question }) => nlToSql(env, question),
    }),

    run_query: tool({
      description:
        "Execute a read-only R2 SQL query (SELECT/WITH/SHOW/DESCRIBE/EXPLAIN) against the warehouse. LIMIT is auto-injected at 500 and capped at 10000. Returns rows (capped at 100 for chat), schema, and scan metrics.",
      inputSchema: z.object({ sql: z.string().describe("The SQL statement to run. FROM uses namespace.table.") }),
      execute: async ({ sql }) => {
        const guard = guardSql(sql);
        if (!guard.allowed) return { ok: false, error: guard.reason };
        const result = await queryR2Sql(env, guard.sql);
        logOperation(env, {
          source: "r2sql", operation: "agent_run_query", ok: result.ok, status: result.status,
          durationMs: result.durationMs, sql: guard.sql, requestId: result.requestId,
          rowsReturned: result.rows.length, filesScanned: result.metrics.files_scanned,
          bytesScanned: result.metrics.bytes_scanned, error: result.errors[0]?.message,
          metadata: { rewrites: guard.rewrites, via: "chat-agent" },
        });
        return {
          ok: result.ok,
          sql: guard.sql,
          rowCount: result.rows.length,
          rows: result.rows.slice(0, TOOL_ROW_CAP),
          truncated: result.rows.length > TOOL_ROW_CAP,
          metrics: result.metrics,
          requestId: result.requestId,
          errors: result.errors,
        };
      },
    }),

    interpret_results: tool({
      description: "Produce a short plain-language interpretation of a result set you just obtained from run_query.",
      inputSchema: z.object({
        sql: z.string(),
        rows: z.array(z.record(z.string(), z.unknown())).describe("The rows to interpret (pass what run_query returned)."),
      }),
      execute: async ({ sql, rows }) => interpretResults(env, { sql, rows }),
    }),

    detect_anomalies: tool({
      description: "Scan a result set for statistical, operational, and semantic anomalies (null spikes, outliers, impossible values, compaction warnings).",
      inputSchema: z.object({
        sql: z.string(),
        rows: z.array(z.record(z.string(), z.unknown())),
        filesScanned: z.number().optional().describe("files_scanned from the query metrics, when available."),
      }),
      execute: async ({ sql, rows, filesScanned }) =>
        detectAnomalies(env, { sql, rows, metrics: { files_scanned: filesScanned } }),
    }),

    suggest_queries: tool({
      description: "Suggest 3-5 ready-to-run follow-up queries for the current exploration.",
      inputSchema: z.object({
        sql: z.string().describe("The current/last query."),
        columns: z.array(z.string()).optional(),
        rowCount: z.number().optional(),
      }),
      execute: async ({ sql, columns, rowCount }) => ({
        suggestions: await suggestNextQueries(env, { sql, columns, rowCount }),
      }),
    }),

    lookup_permits: tool({
      description:
        "Live SF permit lookup via the public SODA API. Use mode 'address' (streetNumber + streetName, no suffix) or 'permit_number'.",
      inputSchema: z.object({
        mode: z.enum(["address", "permit_number"]),
        streetNumber: z.string().optional(),
        streetName: z.string().optional(),
        unit: z.string().optional(),
        permitNumber: z.string().optional(),
      }),
      execute: async (input) => {
        if (input.mode === "address") {
          if (!input.streetNumber || !input.streetName) return { ok: false, error: "address mode needs streetNumber and streetName" };
          const res = await lookupPermitsByAddress(env, { streetNumber: input.streetNumber, streetName: input.streetName, unit: input.unit });
          return { ok: res.ok, count: res.rows.length, rows: res.rows.slice(0, 50), error: res.error };
        }
        if (!input.permitNumber) return { ok: false, error: "permit_number mode needs permitNumber" };
        const res = await lookupPermitByNumber(env, input.permitNumber);
        return { ok: res.ok, count: res.rows.length, rows: res.rows, error: res.error };
      },
    }),

    vet_contractor: tool({
      description:
        "Vet a contractor/architect/engineer using the warehouse permit_contractors table: aggregate SF permit track record by license number and/or firm name.",
      inputSchema: z.object({
        license: z.string().optional().describe("CSLB license number (exact)."),
        name: z.string().optional().describe("Firm name (substring)."),
        city: z.string().optional(),
        role: z.string().optional().describe("contractor | architect | engineer"),
      }),
      execute: async (input) => {
        const res = await vetContractor(env, input);
        return { ...res, recentPermits: res.recentPermits.slice(0, 25) };
      },
    }),
  };
}

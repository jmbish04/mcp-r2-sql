/**
 * @fileoverview Workers AI analytics REST API router.
 *
 * Mounted at `/api/ai` in `api/index.ts`.
 *
 * Route inventory:
 *   POST /nl2sql     – natural-language question -> guard-validated R2 SQL draft
 *   POST /interpret  – plain-language reading of a result set
 *   POST /anomalies  – statistical + operational + semantic anomaly scan
 *   POST /suggest    – 3-5 ready-to-run follow-up queries
 *   GET  /health     – AI binding probe (tiny structured generation)
 *
 * All operations log into the D1 `query_logs` layer (source = "ai").
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { detectAnomalies } from "@/backend/ai/providers/anomaly";
import { interpretResults } from "@/backend/ai/providers/interpret";
import { nlToSql } from "@/backend/ai/providers/nl2sql";
import { suggestNextQueries } from "@/backend/ai/providers/suggest";
import { logOperation } from "@/backend/data-platform";

export const aiRouter = new OpenAPIHono<{ Bindings: Env }>();

const rowsSchema = z.array(z.record(z.string(), z.unknown()));
const metricsSchema = z.object({
  files_scanned: z.number().optional(),
  bytes_scanned: z.number().optional(),
  r2_requests_count: z.number().optional(),
  cache_hits: z.number().optional(),
}).optional();

/** Wrap a provider call with timing + D1 logging + uniform error mapping. */
async function withAiLog<T>(
  c: { env: Env; executionCtx: { waitUntil(p: Promise<unknown>): void } },
  operation: string,
  run: () => Promise<T>,
): Promise<{ ok: true; value: T; durationMs: number } | { ok: false; error: string; durationMs: number }> {
  const t0 = Date.now();
  try {
    const value = await run();
    const durationMs = Date.now() - t0;
    logOperation(c.env, { source: "ai", operation, ok: true, status: 200, durationMs, metadata: {} }, c.executionCtx);
    return { ok: true, value, durationMs };
  } catch (err) {
    const durationMs = Date.now() - t0;
    const error = err instanceof Error ? err.message : String(err);
    logOperation(c.env, { source: "ai", operation, ok: false, status: 500, durationMs, error, metadata: {} }, c.executionCtx);
    return { ok: false, error, durationMs };
  }
}

// ---------------------------------------------------------------------------
// POST /nl2sql
// ---------------------------------------------------------------------------

aiRouter.openapi(
  createRoute({
    method: "post",
    path: "/nl2sql",
    tags: ["AI"],
    summary: "Draft a guard-validated R2 SQL query from a natural-language question",
    operationId: "aiNlToSql",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              question: z.string().min(3).openapi({ example: "Which contractors pulled the most permits in 2024?" }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "SQL draft + validation status (surface the SQL to the user before running).",
        content: {
          "application/json": {
            schema: z.object({
              ok: z.boolean(),
              sql: z.string().nullable(),
              rationale: z.string().nullable(),
              rewrites: z.array(z.string()),
              explainOk: z.boolean().nullable(),
              error: z.string().nullable(),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const { question } = c.req.valid("json");
    const res = await withAiLog(c, "nl2sql", () => nlToSql(c.env, question));
    if (!res.ok) return c.json({ ok: false, sql: null, rationale: null, rewrites: [], explainOk: null, error: res.error }, 200);
    return c.json(res.value, 200);
  },
);

// ---------------------------------------------------------------------------
// POST /interpret
// ---------------------------------------------------------------------------

aiRouter.openapi(
  createRoute({
    method: "post",
    path: "/interpret",
    tags: ["AI"],
    summary: "Plain-language interpretation of an R2 SQL result set",
    operationId: "aiInterpret",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({ sql: z.string().min(1), rows: rowsSchema, metrics: metricsSchema }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Summary + highlights.",
        content: {
          "application/json": {
            schema: z.object({
              ok: z.boolean(),
              summary: z.string().optional(),
              highlights: z.array(z.string()).optional(),
              sampledRows: z.number().optional(),
              error: z.string().optional(),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const res = await withAiLog(c, "interpret", () => interpretResults(c.env, body));
    return res.ok ? c.json({ ok: true, ...res.value }, 200) : c.json({ ok: false, error: res.error }, 200);
  },
);

// ---------------------------------------------------------------------------
// POST /anomalies
// ---------------------------------------------------------------------------

aiRouter.openapi(
  createRoute({
    method: "post",
    path: "/anomalies",
    tags: ["AI"],
    summary: "Statistical + operational + semantic anomaly scan over a result set",
    operationId: "aiAnomalies",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({ sql: z.string().min(1), rows: rowsSchema, metrics: metricsSchema }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Anomaly list + column statistics.",
        content: {
          "application/json": {
            schema: z.object({
              ok: z.boolean(),
              anomalies: z.array(z.object({
                kind: z.enum(["statistical", "operational", "semantic"]),
                column: z.string().nullable(),
                severity: z.enum(["info", "warn", "high"]),
                description: z.string(),
              })).optional(),
              stats: z.record(z.string(), z.unknown()).optional(),
              error: z.string().optional(),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const res = await withAiLog(c, "anomalies", () => detectAnomalies(c.env, body));
    return res.ok ? c.json({ ok: true, ...res.value }, 200) : c.json({ ok: false, error: res.error }, 200);
  },
);

// ---------------------------------------------------------------------------
// POST /suggest
// ---------------------------------------------------------------------------

aiRouter.openapi(
  createRoute({
    method: "post",
    path: "/suggest",
    tags: ["AI"],
    summary: "Suggest 3-5 ready-to-run follow-up queries",
    operationId: "aiSuggest",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              sql: z.string().min(1),
              columns: z.array(z.string()).optional(),
              rowCount: z.number().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Guard-validated follow-up query suggestions.",
        content: {
          "application/json": {
            schema: z.object({
              ok: z.boolean(),
              suggestions: z.array(z.object({ sql: z.string(), rationale: z.string() })).optional(),
              error: z.string().optional(),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const res = await withAiLog(c, "suggest", () => suggestNextQueries(c.env, body));
    return res.ok ? c.json({ ok: true, suggestions: res.value }, 200) : c.json({ ok: false, error: res.error }, 200);
  },
);

// ---------------------------------------------------------------------------
// GET /health — tiny structured generation through the AI binding
// ---------------------------------------------------------------------------

aiRouter.openapi(
  createRoute({
    method: "get",
    path: "/health",
    tags: ["AI"],
    summary: "Health: AI binding + structured-output round trip",
    operationId: "aiHealth",
    responses: {
      200: {
        description: "Probe status.",
        content: {
          "application/json": {
            schema: z.object({
              status: z.enum(["ok", "fail"]),
              model: z.string(),
              durationMs: z.number(),
              error: z.string().optional(),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const t0 = Date.now();
    try {
      const { generateStructuredOutput } = await import("@/backend/ai/providers/index");
      await generateStructuredOutput(c.env, {
        messages: [
          { role: "system", content: `Reply with the JSON object only.` },
          { role: "user", content: `Return {"pong": true}.` },
        ],
        schema: z.object({ pong: z.boolean() }),
        schemaName: "ping",
        max_tokens: 2000,
      });
      return c.json({ status: "ok" as const, model: c.env.MODEL_EXTRACT, durationMs: Date.now() - t0 }, 200);
    } catch (err) {
      return c.json({ status: "fail" as const, model: c.env.MODEL_EXTRACT, durationMs: Date.now() - t0, error: err instanceof Error ? err.message : String(err) }, 200);
    }
  },
);

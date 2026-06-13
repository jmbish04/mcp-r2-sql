/**
 * @fileoverview R2 SQL REST API router — guarded warehouse queries + schema
 * browser endpoints.
 *
 * Mounted at `/api/r2` in `api/index.ts`.
 *
 * Route inventory:
 *   POST /query        – run an arbitrary guarded read query (SELECT/WITH/SHOW/DESCRIBE/EXPLAIN)
 *   GET  /namespaces   – live catalog namespace listing
 *   GET  /tables       – live catalog table listing (+ discovered row counts)
 *   GET  /describe     – DESCRIBE a table via R2 SQL (falls back to the discovered schema)
 *   GET  /schema       – the full Phase-0 discovered schema document
 *   GET  /health       – binding/secret/catalog/D1 probes for this route family
 *
 * Every operation logs one structured row into the D1 `query_logs` table.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import {
  DISCOVERED_SCHEMA,
  findTable,
  getCatalogStatus,
  getR2SqlToken,
  guardSql,
  listNamespaces,
  listTables,
  logOperation,
  queryR2Sql,
} from "@/backend/data-platform";

export const r2Router = new OpenAPIHono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

const metricsSchema = z
  .object({
    r2_requests_count: z.number().optional(),
    files_scanned: z.number().optional(),
    bytes_scanned: z.number().optional(),
    cache_hits: z.number().optional(),
  })
  .openapi({ description: "R2 SQL per-query execution metrics." });

const queryResponseSchema = z.object({
  ok: z.boolean(),
  sql: z.string().openapi({ description: "The SQL actually executed (after guard rewrites)." }),
  rewrites: z.array(z.string()).openapi({ description: "Guard rewrites applied (e.g. limit-injected:500)." }),
  rows: z.array(z.record(z.string(), z.unknown())),
  schema: z.array(z.record(z.string(), z.unknown())).openapi({ description: "R2 SQL column descriptors." }),
  metrics: metricsSchema,
  requestId: z.string().nullable(),
  durationMs: z.number(),
  errors: z.array(z.object({ code: z.number().nullable(), message: z.string() })),
});

const errorSchema = z.object({ error: z.string() });

// ---------------------------------------------------------------------------
// POST /query — arbitrary guarded read query
// ---------------------------------------------------------------------------

r2Router.openapi(
  createRoute({
    method: "post",
    path: "/query",
    tags: ["R2 SQL"],
    summary: "Run a guarded read-only SQL query against the R2 SQL warehouse",
    operationId: "r2Query",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              sql: z.string().min(1).openapi({
                description:
                  "Read-only SQL (SELECT/WITH/SHOW/DESCRIBE/EXPLAIN). FROM uses namespace.table. LIMIT auto-injected at 500, capped at 10000.",
                example: "SELECT status, COUNT(*) AS n FROM sf_dbi.building_permits GROUP BY status ORDER BY n DESC",
              }),
            }),
          },
        },
      },
    },
    responses: {
      200: { description: "Query result (ok=false carries engine errors).", content: { "application/json": { schema: queryResponseSchema } } },
      400: { description: "Query rejected by the guard.", content: { "application/json": { schema: errorSchema.extend({ rewrites: z.array(z.string()).optional() }) } } },
    },
  }),
  async (c) => {
    const { sql } = c.req.valid("json");
    const guard = guardSql(sql);
    if (!guard.allowed) {
      logOperation(c.env, {
        source: "r2sql", operation: "query", ok: false, status: 400, durationMs: 0,
        sql, error: guard.reason, metadata: { stage: "guard" },
      }, c.executionCtx);
      return c.json({ error: guard.reason ?? "Query rejected." }, 400);
    }

    const result = await queryR2Sql(c.env, guard.sql);
    logOperation(c.env, {
      source: "r2sql", operation: "query", ok: result.ok, status: result.status,
      durationMs: result.durationMs, sql: guard.sql, requestId: result.requestId,
      rowsReturned: result.rows.length,
      filesScanned: result.metrics.files_scanned, bytesScanned: result.metrics.bytes_scanned,
      error: result.errors[0]?.message, metadata: { rewrites: guard.rewrites, kind: guard.kind },
    }, c.executionCtx);

    return c.json({
      ok: result.ok,
      sql: guard.sql,
      rewrites: guard.rewrites,
      rows: result.rows,
      schema: result.schema as unknown as Record<string, unknown>[],
      metrics: result.metrics,
      requestId: result.requestId,
      durationMs: result.durationMs,
      errors: result.errors,
    }, 200);
  },
);

// ---------------------------------------------------------------------------
// GET /namespaces — live catalog namespaces
// ---------------------------------------------------------------------------

r2Router.openapi(
  createRoute({
    method: "get",
    path: "/namespaces",
    tags: ["R2 SQL"],
    summary: "List namespaces in the R2 Data Catalog",
    operationId: "r2Namespaces",
    responses: {
      200: {
        description: "Namespace names.",
        content: { "application/json": { schema: z.object({ ok: z.boolean(), namespaces: z.array(z.string()), errors: z.array(z.string()) }) } },
      },
    },
  }),
  async (c) => {
    const res = await listNamespaces(c.env);
    logOperation(c.env, {
      source: "catalog", operation: "list_namespaces", ok: res.ok, status: res.status,
      durationMs: 0, error: res.errors[0], metadata: { count: res.namespaces.length },
    }, c.executionCtx);
    return c.json({ ok: res.ok, namespaces: res.namespaces, errors: res.errors }, 200);
  },
);

// ---------------------------------------------------------------------------
// GET /tables — live catalog tables + discovered row counts
// ---------------------------------------------------------------------------

r2Router.openapi(
  createRoute({
    method: "get",
    path: "/tables",
    tags: ["R2 SQL"],
    summary: "List tables in a namespace (default: the discovered sf_dbi namespace)",
    operationId: "r2Tables",
    request: {
      query: z.object({
        namespace: z.string().optional().openapi({ description: "Namespace to list (defaults to R2_NAMESPACE)." }),
      }),
    },
    responses: {
      200: {
        description: "Tables with creation time and discovered row counts.",
        content: {
          "application/json": {
            schema: z.object({
              ok: z.boolean(),
              namespace: z.string(),
              tables: z.array(z.object({
                name: z.string(),
                created_at: z.string().optional(),
                total_records: z.number().nullable().openapi({ description: "Row count from the Phase-0 Iceberg snapshot (null for tables discovered after Phase 0)." }),
              })),
              errors: z.array(z.string()),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const namespace = c.req.valid("query").namespace ?? c.env.R2_NAMESPACE;
    const res = await listTables(c.env, namespace);
    logOperation(c.env, {
      source: "catalog", operation: "list_tables", ok: res.ok, status: res.status,
      durationMs: 0, error: res.errors[0], metadata: { namespace, count: res.tables.length },
    }, c.executionCtx);
    return c.json({
      ok: res.ok,
      namespace,
      tables: res.tables.map((t) => ({
        name: t.name,
        created_at: t.created_at,
        total_records: findTable(t.name)?.info.total_records ?? null,
      })),
      errors: res.errors,
    }, 200);
  },
);

// ---------------------------------------------------------------------------
// GET /describe — live DESCRIBE with discovered-schema fallback
// ---------------------------------------------------------------------------

r2Router.openapi(
  createRoute({
    method: "get",
    path: "/describe",
    tags: ["R2 SQL"],
    summary: "Describe a table (live R2 SQL DESCRIBE; discovered-schema fallback)",
    operationId: "r2Describe",
    request: {
      query: z.object({
        table: z.string().min(1).openapi({ description: "Bare or namespace-qualified table name.", example: "sf_dbi.permit_contractors" }),
      }),
    },
    responses: {
      200: {
        description: "Column metadata.",
        content: {
          "application/json": {
            schema: z.object({
              ok: z.boolean(),
              table: z.string(),
              source: z.enum(["r2sql", "discovered"]),
              columns: z.array(z.record(z.string(), z.unknown())),
              errors: z.array(z.string()),
            }),
          },
        },
      },
      404: { description: "Unknown table.", content: { "application/json": { schema: errorSchema } } },
    },
  }),
  async (c) => {
    const { table } = c.req.valid("query");
    const qualified = table.includes(".") ? table : `${c.env.R2_NAMESPACE}.${table}`;

    const result = await queryR2Sql(c.env, `DESCRIBE ${qualified}`);
    logOperation(c.env, {
      source: "r2sql", operation: "describe", ok: result.ok, status: result.status,
      durationMs: result.durationMs, sql: `DESCRIBE ${qualified}`, requestId: result.requestId,
      rowsReturned: result.rows.length, error: result.errors[0]?.message, metadata: {},
    }, c.executionCtx);

    if (result.ok) {
      return c.json({ ok: true, table: qualified, source: "r2sql" as const, columns: result.rows, errors: [] }, 200);
    }

    // Fallback: the Phase-0 discovered schema (keeps the schema browser
    // functional before the R2_SQL_TOKEN secret is provisioned).
    const discovered = findTable(qualified);
    if (!discovered) return c.json({ error: `Unknown table: ${qualified}` }, 404);
    return c.json({
      ok: true,
      table: qualified,
      source: "discovered" as const,
      columns: discovered.info.columns as unknown as Record<string, unknown>[],
      errors: result.errors.map((e) => e.message),
    }, 200);
  },
);

// ---------------------------------------------------------------------------
// GET /schema — the full discovered schema document
// ---------------------------------------------------------------------------

r2Router.openapi(
  createRoute({
    method: "get",
    path: "/schema",
    tags: ["R2 SQL"],
    summary: "The Phase-0 discovered warehouse schema (docs/cslb-schema.json)",
    operationId: "r2Schema",
    responses: {
      200: { description: "Discovered schema document.", content: { "application/json": { schema: z.record(z.string(), z.unknown()) } } },
    },
  }),
  (c) => c.json(DISCOVERED_SCHEMA as unknown as Record<string, unknown>, 200),
);

// ---------------------------------------------------------------------------
// GET /health — probes for this route family
// ---------------------------------------------------------------------------

r2Router.openapi(
  createRoute({
    method: "get",
    path: "/health",
    tags: ["R2 SQL"],
    summary: "Health: R2 SQL token, catalog reachability, free EXPLAIN probe, D1 logging",
    operationId: "r2Health",
    responses: {
      200: {
        description: "Per-check status.",
        content: {
          "application/json": {
            schema: z.object({
              status: z.enum(["ok", "degraded", "fail"]),
              checks: z.array(z.object({ name: z.string(), status: z.string(), message: z.string().optional(), durationMs: z.number() })),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const checks: { name: string; status: "ok" | "warn" | "fail"; message?: string; durationMs: number }[] = [];

    // 1. Secret present? (Secrets Store binding R2_SQL_TOKEN → CLOUDFLARE_R2_SQL_TOKEN)
    const token = await getR2SqlToken(c.env);
    checks.push({
      name: "r2_sql_token",
      status: token ? "ok" : "fail",
      message: token ? undefined : "R2_SQL_TOKEN Secrets Store binding not resolvable (store secret CLOUDFLARE_R2_SQL_TOKEN).",
      durationMs: 0,
    });

    // 2. Catalog reachable + active?
    let t0 = Date.now();
    const cat = await getCatalogStatus(c.env);
    checks.push({
      name: "catalog_status",
      status: cat.ok && cat.result?.status === "active" ? "ok" : "fail",
      message: cat.ok ? `status=${cat.result?.status}` : cat.errors[0],
      durationMs: Date.now() - t0,
    });

    // 3. Free EXPLAIN probe through the SQL engine (no bytes scanned).
    t0 = Date.now();
    const probeTable = `${c.env.R2_NAMESPACE}.${Object.keys(DISCOVERED_SCHEMA.tables)[0]}`;
    const probe = await queryR2Sql(c.env, `EXPLAIN SELECT 1 FROM ${probeTable} LIMIT 1`);
    checks.push({
      name: "r2sql_explain_probe",
      status: probe.ok ? "ok" : "fail",
      message: probe.ok ? `request_id=${probe.requestId}` : probe.errors[0]?.message,
      durationMs: Date.now() - t0,
    });

    // 4. D1 logging layer writable?
    t0 = Date.now();
    let d1ok = true;
    try {
      await logOperation(c.env, { source: "diagnostics", operation: "health_probe", ok: true, status: 200, durationMs: 0, metadata: {} });
    } catch {
      d1ok = false;
    }
    checks.push({ name: "d1_query_logs", status: d1ok ? "ok" : "fail", durationMs: Date.now() - t0 });

    const failed = checks.filter((ch) => ch.status === "fail").length;
    const status: "ok" | "degraded" | "fail" = failed === 0 ? "ok" : failed < checks.length ? "degraded" : "fail";
    return c.json({ status, checks }, 200);
  },
);

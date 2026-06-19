/**
 * @fileoverview SF permits REST API router (SODA proxy).
 *
 * Mounted at `/api/permits` in `api/index.ts`.
 *
 * Route inventory:
 *   POST /lookup  – permit lookup by address, permit number, or raw $where
 *   GET  /health  – SODA reachability probe + D1 logging probe
 *
 * The SODA Building Permits dataset (i98e-djp9) has no contractor column —
 * contractor vetting is served by `/api/r2/query` against
 * `sf_dbi.permit_contractors` instead.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import {
  guardSql,
  logOperation,
  lookupPermitByNumber,
  lookupPermitsByAddress,
  lookupPermitsWhere,
  queryR2Sql,
  withDerivedStatus,
} from "@/backend/data-platform";

export const permitsRouter = new OpenAPIHono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// POST /lookup
// ---------------------------------------------------------------------------

const lookupBodySchema = z
  .discriminatedUnion("mode", [
    z.object({
      mode: z.literal("address"),
      streetNumber: z.string().min(1).openapi({ example: "301" }),
      streetName: z.string().min(1).openapi({ example: "Mission", description: "Street name WITHOUT suffix (the dataset stores suffix separately)." }),
      unit: z.string().optional(),
    }),
    z.object({
      mode: z.literal("permit_number"),
      permitNumber: z.string().min(1).openapi({ example: "202112011234" }),
    }),
    z.object({
      mode: z.literal("where"),
      where: z.string().min(1).openapi({ description: "Raw SODA $where clause (advanced/agent use).", example: "estimated_cost > 1000000 AND status = 'issued'" }),
    }),
  ])
  .openapi({ description: "Permit lookup request — one of three modes." });

const lookupResponseSchema = z.object({
  ok: z.boolean(),
  mode: z.string(),
  count: z.number(),
  rows: z.array(z.record(z.string(), z.unknown())),
  error: z.string().optional(),
  durationMs: z.number(),
});

permitsRouter.openapi(
  createRoute({
    method: "post",
    path: "/lookup",
    tags: ["Permits"],
    summary: "Look up SF building permits via the public SODA API",
    operationId: "permitsLookup",
    request: { body: { content: { "application/json": { schema: lookupBodySchema } } } },
    responses: {
      200: { description: "Live SODA rows.", content: { "application/json": { schema: lookupResponseSchema } } },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const result =
      body.mode === "address"
        ? await lookupPermitsByAddress(c.env, body)
        : body.mode === "permit_number"
          ? await lookupPermitByNumber(c.env, body.permitNumber)
          : await lookupPermitsWhere(c.env, body.where);

    logOperation(c.env, {
      source: "soda", operation: `lookup_${body.mode}`, ok: result.ok, status: result.status,
      durationMs: result.durationMs, rowsReturned: result.rows.length, error: result.error,
      metadata: { url: result.url },
    }, c.executionCtx);

    return c.json({
      ok: result.ok,
      mode: body.mode,
      count: result.rows.length,
      rows: result.rows.map((r) => withDerivedStatus(r)),
      error: result.error,
      durationMs: result.durationMs,
    }, 200);
  },
);

// ---------------------------------------------------------------------------
// GET /detail — full permit record (SODA) + warehouse addenda + firms
// ---------------------------------------------------------------------------

/** Single-quote-escape a value for an R2 SQL string literal. */
function sqlLit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

permitsRouter.openapi(
  createRoute({
    method: "get",
    path: "/detail",
    tags: ["Permits"],
    summary: "Full permit detail — SODA record + warehouse addenda/review + firms",
    operationId: "permitDetail",
    request: {
      query: z.object({
        permit_number: z.string().min(1).openapi({ example: "202112011234" }),
      }),
    },
    responses: {
      200: {
        description: "Permit record, addenda (review steps), and contractor firms.",
        content: {
          "application/json": {
            schema: z.object({
              ok: z.boolean(),
              permit: z.record(z.string(), z.unknown()).nullable(),
              addenda: z.array(z.record(z.string(), z.unknown())),
              firms: z.array(z.record(z.string(), z.unknown())),
              source: z.object({ permit: z.string(), addenda: z.string(), firms: z.string() }),
              errors: z.array(z.string()),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const permitNumber = c.req.valid("query").permit_number.trim();
    const errors: string[] = [];

    // 1. Live SODA record (authoritative current state).
    const soda = await lookupPermitByNumber(c.env, permitNumber);
    if (!soda.ok && soda.error) errors.push(`SODA: ${soda.error}`);

    // 2. Warehouse addenda (review/plan-check steps) for this permit.
    const addendaSql = guardSql(
      `SELECT addenda_number, step, station, department, addenda_status, review_results, arrive, assign_date, start_date, finish_date, approved_date, plan_checked_by, hold_description, processing_hours FROM sf_dbi.permit_addenda WHERE permit_number = ${sqlLit(permitNumber)} ORDER BY addenda_number, start_date LIMIT 500`,
    );
    const addenda = addendaSql.allowed ? await queryR2Sql(c.env, addendaSql.sql) : null;
    if (addenda && !addenda.ok && addenda.errors[0]) errors.push(`addenda: ${addenda.errors[0].message}`);

    // 3. Contractor firms recorded against this permit.
    const firmsSql = guardSql(
      `SELECT DISTINCT firm_name, license1, role, firm_city, firm_state FROM sf_dbi.permit_contractors WHERE permit_number = ${sqlLit(permitNumber)} LIMIT 100`,
    );
    const firms = firmsSql.allowed ? await queryR2Sql(c.env, firmsSql.sql) : null;
    if (firms && !firms.ok && firms.errors[0]) errors.push(`firms: ${firms.errors[0].message}`);

    logOperation(c.env, {
      source: "r2sql", operation: "permit_detail", ok: errors.length === 0, status: 200,
      durationMs: (addenda?.durationMs ?? 0) + (firms?.durationMs ?? 0), sql: addendaSql.sql,
      rowsReturned: (addenda?.rows.length ?? 0) + (firms?.rows.length ?? 0),
      error: errors[0], metadata: { permitNumber },
    }, c.executionCtx);

    return c.json({
      ok: errors.length === 0,
      permit: soda.rows[0] ? withDerivedStatus(soda.rows[0]) : null,
      addenda: addenda?.rows ?? [],
      firms: firms?.rows ?? [],
      source: { permit: "soda", addenda: "sf_dbi.permit_addenda", firms: "sf_dbi.permit_contractors" },
      errors,
    }, 200);
  },
);

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

permitsRouter.openapi(
  createRoute({
    method: "get",
    path: "/health",
    tags: ["Permits"],
    summary: "Health: SODA endpoint reachability",
    operationId: "permitsHealth",
    responses: {
      200: {
        description: "Probe status.",
        content: {
          "application/json": {
            schema: z.object({
              status: z.enum(["ok", "fail"]),
              checks: z.array(z.object({ name: z.string(), status: z.string(), message: z.string().optional(), durationMs: z.number() })),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const t0 = Date.now();
    const probe = await lookupPermitsWhere(c.env, "permit_number IS NOT NULL");
    const checks = [
      {
        name: "soda_reachable",
        status: probe.ok ? ("ok" as const) : ("fail" as const),
        message: probe.ok ? `${probe.rows.length} sample rows` : probe.error,
        durationMs: Date.now() - t0,
      },
    ];
    logOperation(c.env, {
      source: "soda", operation: "health_probe", ok: probe.ok, status: probe.status,
      durationMs: probe.durationMs, error: probe.error, metadata: {},
    }, c.executionCtx);
    return c.json({ status: probe.ok ? ("ok" as const) : ("fail" as const), checks }, 200);
  },
);

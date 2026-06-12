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
  logOperation,
  lookupPermitByNumber,
  lookupPermitsByAddress,
  lookupPermitsWhere,
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
      rows: result.rows,
      error: result.error,
      durationMs: result.durationMs,
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

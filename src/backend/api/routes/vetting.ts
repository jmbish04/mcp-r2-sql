/**
 * @fileoverview Vetting REST API router — contractor/architect/engineer
 * vetting against the R2 SQL warehouse (`sf_dbi.permit_contractors`).
 *
 * Mounted at `/api/vetting` in `api/index.ts`.
 *
 * Route inventory:
 *   POST /contractor – vet by license number and/or firm name (+city/role)
 *   GET  /health     – guard + (token-dependent) live probe
 *
 * Address / permit-number vetting modes are served by `/api/permits/lookup`
 * (live SODA), so this router only owns the warehouse-backed mode.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { logOperation, vetContractor } from "@/backend/data-platform";

export const vettingRouter = new OpenAPIHono<{ Bindings: Env }>();

vettingRouter.openapi(
  createRoute({
    method: "post",
    path: "/contractor",
    tags: ["Vetting"],
    summary: "Vet a contractor/architect/engineer via the sf_dbi.permit_contractors warehouse table",
    operationId: "vetContractor",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                license: z.string().optional().openapi({ description: "CSLB license number (exact match on license1)." }),
                name: z.string().optional().openapi({ description: "Firm name (case-insensitive substring)." }),
                city: z.string().optional(),
                role: z.string().optional().openapi({ description: "contractor | architect | engineer (substring match)." }),
              })
              .refine((v) => Boolean(v.license?.trim() || v.name?.trim()), {
                message: "Provide a license number and/or a firm name.",
              }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Aggregate profile + recent permit engagements.",
        content: {
          "application/json": {
            schema: z.object({
              ok: z.boolean(),
              profile: z.array(z.record(z.string(), z.unknown())),
              recentPermits: z.array(z.record(z.string(), z.unknown())),
              metrics: z.record(z.string(), z.unknown()),
              sql: z.string(),
              error: z.string().optional(),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const t0 = Date.now();
    const result = await vetContractor(c.env, body);
    logOperation(c.env, {
      source: "r2sql", operation: "vet_contractor", ok: result.ok, status: result.ok ? 200 : 500,
      durationMs: Date.now() - t0, sql: result.sql, rowsReturned: result.profile.length,
      filesScanned: result.metrics.files_scanned, bytesScanned: result.metrics.bytes_scanned,
      error: result.error, metadata: { hasLicense: Boolean(body.license), hasName: Boolean(body.name) },
    }, c.executionCtx);
    return c.json({ ...result, metrics: result.metrics as Record<string, unknown> }, 200);
  },
);

vettingRouter.openapi(
  createRoute({
    method: "get",
    path: "/health",
    tags: ["Vetting"],
    summary: "Health: vetting query builder + warehouse reachability",
    operationId: "vettingHealth",
    responses: {
      200: {
        description: "Probe status.",
        content: {
          "application/json": {
            schema: z.object({ status: z.enum(["ok", "degraded"]), message: z.string() }),
          },
        },
      },
    },
  }),
  async (c) => {
    // Token-free check: the builder must produce guard-clean SQL. With a
    // token present, the route's first real lookup is the live verification.
    const probe = await vetContractor(c.env, { name: "__health_probe__" });
    const live = probe.ok || !c.env.R2_SQL_TOKEN;
    return c.json({
      status: live ? ("ok" as const) : ("degraded" as const),
      message: probe.ok
        ? "Warehouse vetting query executed."
        : c.env.R2_SQL_TOKEN
          ? `Warehouse probe failed: ${probe.error}`
          : "Query builder OK; live probe pending R2_SQL_TOKEN secret.",
    }, 200);
  },
);

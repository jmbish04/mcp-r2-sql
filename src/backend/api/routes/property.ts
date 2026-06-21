/**
 * @fileoverview Property signals REST API — the homeowner "watch my property"
 * surface over the DataSF live datasets (Notices of Violation, DBI complaints,
 * Fire permits, Planning review, Fire inspections, permit contacts, review +
 * issuance metrics) plus the "how busy is DBI right now" workload signal.
 *
 * Mounted at `/api/property`. All lookups are LIVE SODA, keyed by block/lot,
 * parcel number, or address. Warehouse-scale ingestion of these datasets is the
 * ingestion pipeline's job (docs/0003_pipeline_migration).
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import {
  SODA_DATASETS,
  cityReviewPace,
  fetchDataset,
  logOperation,
  propertySignals,
} from "@/backend/data-platform";
import { propertyInsight } from "@/backend/ai/providers/property-insight";

export const propertyRouter = new OpenAPIHono<{ Bindings: Env }>();

const anyObj = z.record(z.string(), z.unknown());

/** Property identifier query params (any subset; more keys = more datasets resolve). */
const keysQuery = z.object({
  block: z.string().optional(),
  lot: z.string().optional(),
  parcelNumber: z.string().optional(),
  streetNumber: z.string().optional(),
  streetName: z.string().optional(),
  zip: z.string().optional(),
});

// GET /api/property/datasets — the registry (keys + labels + descriptions).
propertyRouter.openapi(
  createRoute({
    method: "get", path: "/datasets", tags: ["Property"], summary: "List watched DataSF datasets", operationId: "propDatasets",
    responses: { 200: { description: "ok", content: { "application/json": { schema: z.object({ datasets: z.array(z.object({ key: z.string(), id: z.string(), label: z.string(), description: z.string() })) }) } } } },
  }),
  (c) => c.json({ datasets: SODA_DATASETS.map((d) => ({ key: d.key, id: d.id, label: d.label, description: d.description })) }, 200),
);

// GET /api/property/signals — every watched dataset for one property (the full picture).
propertyRouter.openapi(
  createRoute({
    method: "get", path: "/signals", tags: ["Property"], summary: "All watched signals for a property", operationId: "propSignals",
    request: { query: keysQuery.extend({ only: z.string().optional().openapi({ description: "Comma-separated dataset keys to limit to." }), limit: z.coerce.number().optional() }) },
    responses: { 200: { description: "ok", content: { "application/json": { schema: z.object({ keys: anyObj, datasets: anyObj }) } } } },
  }),
  async (c) => {
    const q = c.req.valid("query");
    const only = q.only ? q.only.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
    const out = await propertySignals(q, { only, limit: q.limit });
    const totalRows = Object.values(out.datasets).reduce((a, d) => a + d.count, 0);
    logOperation(c.env, { source: "soda", operation: "property_signals", ok: true, status: 200, durationMs: 0, rowsReturned: totalRows, metadata: { keys: out.keys } }, c.executionCtx);
    return c.json(out as { keys: Record<string, unknown>; datasets: Record<string, unknown> }, 200);
  },
);

// GET /api/property/dataset/{key} — a single watched dataset for one property.
propertyRouter.openapi(
  createRoute({
    method: "get", path: "/dataset/{key}", tags: ["Property"], summary: "One watched dataset for a property", operationId: "propDataset",
    request: { params: z.object({ key: z.string() }), query: keysQuery.extend({ limit: z.coerce.number().optional() }) },
    responses: { 200: { description: "ok", content: { "application/json": { schema: z.object({ ok: z.boolean(), key: z.string(), label: z.string(), count: z.number(), rows: z.array(anyObj), error: z.string().optional() }) } } } },
  }),
  async (c) => {
    const { key } = c.req.valid("param");
    const q = c.req.valid("query");
    const res = await fetchDataset(key, q, q.limit ?? 200);
    logOperation(c.env, { source: "soda", operation: `property_dataset:${key}`, ok: res.ok, status: res.status, durationMs: res.durationMs, rowsReturned: res.rows.length, error: res.error, metadata: { url: res.url } }, c.executionCtx);
    return c.json({ ok: res.ok, key: res.key, label: res.label, count: res.rows.length, rows: res.rows, error: res.error }, 200);
  },
);

// GET /api/property/dbi-workload — current City review-pace baseline:
// DBI issuance turnaround + completeness-check pace + Planning review pace.
propertyRouter.openapi(
  createRoute({
    method: "get", path: "/dbi-workload", tags: ["Property"], summary: "How busy is the City right now (issuance + completeness + planning review pace)", operationId: "propDbiWorkload",
    request: { query: z.object({ windowDays: z.coerce.number().optional() }) },
    responses: { 200: { description: "ok", content: { "application/json": { schema: anyObj } } } },
  }),
  async (c) => {
    const res = await cityReviewPace(c.req.valid("query").windowDays ?? 90);
    logOperation(c.env, { source: "soda", operation: "city_review_pace", ok: res.issuance.ok, status: 200, durationMs: 0, rowsReturned: res.issuance.byType?.length ?? 0, error: res.issuance.error }, c.executionCtx);
    return c.json(res as unknown as Record<string, unknown>, 200);
  },
);

// POST /api/property/insight — AI homeowner narrative over the property's
// signals + the City review-pace baseline (one structured Workers AI call).
propertyRouter.openapi(
  createRoute({
    method: "post", path: "/insight", tags: ["Property"], summary: "AI homeowner narrative for a property", operationId: "propInsight",
    request: { body: { content: { "application/json": { schema: keysQuery.extend({ only: z.array(z.string()).optional() }) } } } },
    responses: { 200: { description: "ok", content: { "application/json": { schema: z.object({ ok: z.boolean(), insight: anyObj.optional(), error: z.string().optional() }) } } } },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const [signals, reviewPace] = await Promise.all([
      propertySignals(body, { only: body.only, limit: 50 }),
      cityReviewPace(90),
    ]);
    try {
      const insight = await propertyInsight(c.env, {
        keys: signals.keys as Record<string, unknown>,
        datasets: Object.fromEntries(Object.entries(signals.datasets).map(([k, v]) => [k, { label: v.label, count: v.count, ok: v.ok, rows: v.rows }])),
        reviewPace,
      });
      logOperation(c.env, { source: "ai", operation: "property_insight", ok: true, status: 200, durationMs: 0, rowsReturned: 0, metadata: { keys: signals.keys } }, c.executionCtx);
      return c.json({ ok: true, insight: insight as Record<string, unknown> }, 200);
    } catch (err) {
      return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 200);
    }
  },
);

// GET /api/property/health — probe one dataset.
propertyRouter.openapi(
  createRoute({
    method: "get", path: "/health", tags: ["Property"], summary: "Health", operationId: "propHealth",
    responses: { 200: { description: "ok", content: { "application/json": { schema: z.object({ status: z.string(), datasets: z.number(), probe: z.boolean() }) } } } },
  }),
  async (c) => {
    const probe = await fetchDataset("notices_of_violation", { block: "5934", lot: "005" }, 1);
    return c.json({ status: probe.ok ? "ok" : "degraded", datasets: SODA_DATASETS.length, probe: probe.ok }, 200);
  },
);

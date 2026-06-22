/**
 * @fileoverview Storyteller REST API — threads, plans, specs, filters, named
 * queries, and per-block query execution. Mounted at /api/storyteller.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { generateStructuredOutput } from "@/backend/ai/providers/index";
import { CHART_FAMILIES } from "@/backend/storyteller/spec";
import {
  approvePlan,
  approveSpec,
  createThread,
  getActiveFilters,
  getThreadDetail,
  listNamedQueries,
  listThreads,
  patchSpecBlock,
  runBlockQuery,
  savePlan,
  saveSpec,
  seedStorytellerGlobals,
  setActiveFilters,
  updateThread,
} from "@/backend/storyteller/store";

export const storytellerRouter = new OpenAPIHono<{ Bindings: Env }>();

const anyObj = z.record(z.string(), z.unknown());
const ok = (schema: z.ZodTypeAny) => ({ 200: { description: "ok", content: { "application/json": { schema } } } });

storytellerRouter.openapi(
  createRoute({ method: "get", path: "/threads", tags: ["Storyteller"], summary: "List threads", operationId: "stThreads", responses: ok(z.object({ threads: z.array(anyObj) })) }),
  async (c) => c.json({ threads: await listThreads(c.env) }, 200),
);

storytellerRouter.openapi(
  createRoute({
    method: "post", path: "/threads", tags: ["Storyteller"], summary: "Create thread", operationId: "stCreateThread",
    request: { body: { content: { "application/json": { schema: z.object({ title: z.string().optional(), goalCategory: z.string().optional(), goalSummary: z.string().optional(), address: z.string().optional() }) } } } },
    responses: ok(z.object({ thread: anyObj })),
  }),
  async (c) => c.json({ thread: await createThread(c.env, c.req.valid("json")) }, 200),
);

storytellerRouter.openapi(
  createRoute({ method: "get", path: "/threads/{id}", tags: ["Storyteller"], summary: "Thread detail", operationId: "stThreadDetail", request: { params: z.object({ id: z.string() }) }, responses: { ...ok(anyObj), 404: { description: "not found", content: { "application/json": { schema: z.object({ error: z.string() }) } } } } }),
  async (c) => {
    const d = await getThreadDetail(c.env, c.req.valid("param").id);
    return d ? c.json(d as Record<string, unknown>, 200) : c.json({ error: "not found" }, 404);
  },
);

storytellerRouter.openapi(
  createRoute({ method: "patch", path: "/threads/{id}", tags: ["Storyteller"], summary: "Update thread", operationId: "stUpdateThread", request: { params: z.object({ id: z.string() }), body: { content: { "application/json": { schema: anyObj } } } }, responses: ok(z.object({ thread: anyObj.nullable() })) }),
  async (c) => c.json({ thread: await updateThread(c.env, c.req.valid("param").id, c.req.valid("json")) }, 200),
);

storytellerRouter.openapi(
  createRoute({ method: "post", path: "/threads/{id}/plans", tags: ["Storyteller"], summary: "Save data plan", operationId: "stSavePlan", request: { params: z.object({ id: z.string() }), body: { content: { "application/json": { schema: z.object({ plan: anyObj, fromMessageId: z.string().optional() }) } } } }, responses: ok(anyObj) }),
  async (c) => { const b = c.req.valid("json"); return c.json(await savePlan(c.env, c.req.valid("param").id, b.plan, b.fromMessageId), 200); },
);

storytellerRouter.openapi(
  createRoute({ method: "post", path: "/threads/{id}/plans/{planId}/approve", tags: ["Storyteller"], summary: "Approve plan", operationId: "stApprovePlan", request: { params: z.object({ id: z.string(), planId: z.string() }) }, responses: ok(z.object({ plan: anyObj.nullable() })) }),
  async (c) => { const p = c.req.valid("param"); return c.json({ plan: await approvePlan(c.env, p.id, p.planId) }, 200); },
);

storytellerRouter.openapi(
  createRoute({ method: "post", path: "/threads/{id}/specs", tags: ["Storyteller"], summary: "Save dashboard spec (draft)", operationId: "stSaveSpec", request: { params: z.object({ id: z.string() }), body: { content: { "application/json": { schema: z.object({ spec: anyObj, planId: z.string().optional() }) } } } }, responses: { ...ok(anyObj), 400: { description: "invalid spec", content: { "application/json": { schema: z.object({ error: z.string() }) } } } } }),
  async (c) => {
    const b = c.req.valid("json");
    try { return c.json(await saveSpec(c.env, c.req.valid("param").id, b.spec, b.planId), 200); }
    catch (err) { return c.json({ error: err instanceof Error ? err.message : String(err) }, 400); }
  },
);

storytellerRouter.openapi(
  createRoute({ method: "post", path: "/threads/{id}/specs/{specId}/approve", tags: ["Storyteller"], summary: "Make spec live", operationId: "stApproveSpec", request: { params: z.object({ id: z.string(), specId: z.string() }) }, responses: ok(z.object({ spec: anyObj.nullable() })) }),
  async (c) => { const p = c.req.valid("param"); return c.json({ spec: await approveSpec(c.env, p.id, p.specId) }, 200); },
);

storytellerRouter.openapi(
  createRoute({ method: "patch", path: "/threads/{id}/specs/blocks", tags: ["Storyteller"], summary: "Patch live spec block", operationId: "stPatchBlock", request: { params: z.object({ id: z.string() }), body: { content: { "application/json": { schema: z.object({ op: z.enum(["upsert", "remove"]), block: anyObj }) } } } }, responses: { ...ok(anyObj), 400: { description: "error", content: { "application/json": { schema: z.object({ error: z.string() }) } } } } }),
  async (c) => {
    const b = c.req.valid("json");
    try { return c.json(await patchSpecBlock(c.env, c.req.valid("param").id, b.op, b.block as { id: string }), 200); }
    catch (err) { return c.json({ error: err instanceof Error ? err.message : String(err) }, 400); }
  },
);

storytellerRouter.openapi(
  createRoute({ method: "get", path: "/threads/{id}/filters", tags: ["Storyteller"], summary: "Active filters", operationId: "stGetFilters", request: { params: z.object({ id: z.string() }) }, responses: ok(z.object({ filters: anyObj.nullable() })) }),
  async (c) => c.json({ filters: await getActiveFilters(c.env, c.req.valid("param").id) }, 200),
);

storytellerRouter.openapi(
  createRoute({ method: "post", path: "/threads/{id}/filters", tags: ["Storyteller"], summary: "Set active filters", operationId: "stSetFilters", request: { params: z.object({ id: z.string() }), body: { content: { "application/json": { schema: z.object({ filters: anyObj, label: z.string().optional() }) } } } }, responses: ok(anyObj) }),
  async (c) => { const b = c.req.valid("json"); return c.json(await setActiveFilters(c.env, c.req.valid("param").id, b.filters, b.label), 200); },
);

storytellerRouter.openapi(
  createRoute({
    method: "post", path: "/threads/{id}/run-block", tags: ["Storyteller"], summary: "Run a block's query (named|inline) with active filters", operationId: "stRunBlock",
    request: { params: z.object({ id: z.string() }), body: { content: { "application/json": { schema: z.object({ query: anyObj, filters: anyObj.optional() }) } } } },
    responses: ok(z.object({ ok: z.boolean(), rows: z.array(anyObj), metrics: anyObj, errors: z.array(anyObj) })),
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const b = c.req.valid("json");
    const filters = b.filters ?? ((await getActiveFilters(c.env, id))?.filters as Record<string, unknown> | undefined) ?? {};
    const res = await runBlockQuery(c.env, b.query as never, filters);
    return c.json({ ok: res.ok, rows: res.rows, metrics: res.metrics as Record<string, unknown>, errors: res.errors as unknown as Record<string, unknown>[] }, 200);
  },
);

storytellerRouter.openapi(
  createRoute({ method: "get", path: "/named-queries", tags: ["Storyteller"], summary: "List named queries", operationId: "stNamedQueries", request: { query: z.object({ threadId: z.string().optional() }) }, responses: ok(z.object({ queries: z.array(anyObj) })) }),
  async (c) => c.json({ queries: await listNamedQueries(c.env, c.req.valid("query").threadId) }, 200),
);

// Custom chart: AI composes a catalog chart (family + encoding) for a request
// over the resolved rows. Inert artifact (a catalog chart spec) — no code exec.
storytellerRouter.openapi(
  createRoute({
    method: "post", path: "/threads/{id}/custom", tags: ["Storyteller"], summary: "AI-compose a custom catalog chart for a request", operationId: "stCustom",
    request: { params: z.object({ id: z.string() }), body: { content: { "application/json": { schema: z.object({ prompt: z.string(), query: anyObj, filters: anyObj.optional() }) } } } },
    responses: ok(z.object({ ok: z.boolean(), family: z.string().optional(), encoding: anyObj.optional(), rows: z.array(anyObj), error: z.string().optional() })),
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const b = c.req.valid("json");
    const filters = b.filters ?? ((await getActiveFilters(c.env, id))?.filters as Record<string, unknown> | undefined) ?? {};
    const res = await runBlockQuery(c.env, b.query as never, filters);
    if (!res.ok) return c.json({ ok: false, rows: [], error: res.errors[0]?.message ?? "query failed" }, 200);
    const columns = res.rows.length ? Object.keys(res.rows[0]) : [];
    try {
      const pick = await generateStructuredOutput(c.env, {
        messages: [
          { role: "system", content: `You choose the best chart from a fixed catalog to answer a user's request over tabular rows. Reply with the JSON object only.` },
          { role: "user", content: `Request: ${b.prompt}\nColumns: ${columns.join(", ")}\nAllowed chart families: ${CHART_FAMILIES.join(", ")}\nChoose one family and an encoding mapping its x (category/date column), y (numeric column(s)), and optional series. Use only the listed columns.` },
        ],
        schema: z.object({
          family: z.enum(CHART_FAMILIES as unknown as [string, ...string[]]),
          encoding: z.object({ x: z.string().optional(), y: z.union([z.string(), z.array(z.string())]).optional(), series: z.string().optional(), value: z.string().optional(), valueLabels: z.boolean().optional(), stacked: z.boolean().optional() }),
        }),
        schemaName: "custom_chart_pick",
        temperature: 0.1,
      });
      return c.json({ ok: true, family: pick.family, encoding: pick.encoding, rows: res.rows }, 200);
    } catch (err) {
      return c.json({ ok: false, rows: res.rows, error: err instanceof Error ? err.message : String(err) }, 200);
    }
  },
);

storytellerRouter.openapi(
  createRoute({ method: "post", path: "/seed-globals", tags: ["Storyteller"], summary: "Seed global named-query templates + agentic_sf_context", operationId: "stSeedGlobals", responses: ok(anyObj) }),
  async (c) => c.json(await seedStorytellerGlobals(c.env), 200),
);

storytellerRouter.openapi(
  createRoute({ method: "get", path: "/health", tags: ["Storyteller"], summary: "Health", operationId: "stHealth", responses: ok(z.object({ status: z.string(), threads: z.number() })) }),
  async (c) => c.json({ status: "ok", threads: (await listThreads(c.env)).length }, 200),
);

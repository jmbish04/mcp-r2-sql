/**
 * @fileoverview agentic_sf_context CRUD API (the self-serve context config
 * panel). Mounted at /api/context.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { asc, eq } from "drizzle-orm";

import { getDb } from "@/backend/db";
import { agenticSfContext } from "@db/schemas";
import { listContext } from "@/backend/storyteller/store";

export const contextRouter = new OpenAPIHono<{ Bindings: Env }>();

const ctxSchema = z.object({
  id: z.string(), category: z.string(), topic: z.string(), content: z.string(),
  dataSignals: z.string().nullable(), homeownerAction: z.string().nullable(),
  priority: z.number(), enabled: z.boolean(),
});

contextRouter.openapi(
  createRoute({
    method: "get", path: "/", tags: ["Context"], summary: "List context (filter by category/enabled)", operationId: "ctxList",
    request: { query: z.object({ category: z.string().optional(), enabled: z.enum(["true", "false"]).optional() }) },
    responses: { 200: { description: "ok", content: { "application/json": { schema: z.object({ items: z.array(ctxSchema) }) } } } },
  }),
  async (c) => {
    const q = c.req.valid("query");
    const rows = await listContext(c.env, { category: q.category, enabledOnly: q.enabled === "true" });
    return c.json({ items: rows.map((r) => ({ id: r.id, category: r.category, topic: r.topic, content: r.content, dataSignals: r.dataSignals, homeownerAction: r.homeownerAction, priority: r.priority, enabled: r.enabled })) }, 200);
  },
);

contextRouter.openapi(
  createRoute({ method: "get", path: "/categories", tags: ["Context"], summary: "Distinct categories", operationId: "ctxCategories", responses: { 200: { description: "ok", content: { "application/json": { schema: z.object({ categories: z.array(z.string()) }) } } } } }),
  async (c) => {
    const rows = await getDb(c.env).selectDistinct({ category: agenticSfContext.category }).from(agenticSfContext).orderBy(asc(agenticSfContext.category));
    return c.json({ categories: rows.map((r) => r.category) }, 200);
  },
);

contextRouter.openapi(
  createRoute({
    method: "post", path: "/", tags: ["Context"], summary: "Create context row", operationId: "ctxCreate",
    request: { body: { content: { "application/json": { schema: z.object({ category: z.string(), topic: z.string(), content: z.string(), dataSignals: z.string().optional(), homeownerAction: z.string().optional(), priority: z.number().optional() }) } } } },
    responses: { 200: { description: "ok", content: { "application/json": { schema: z.object({ item: ctxSchema }) } } } },
  }),
  async (c) => {
    const b = c.req.valid("json");
    const [row] = await getDb(c.env).insert(agenticSfContext).values({ ...b, updatedAt: new Date() }).returning();
    return c.json({ item: { id: row.id, category: row.category, topic: row.topic, content: row.content, dataSignals: row.dataSignals, homeownerAction: row.homeownerAction, priority: row.priority, enabled: row.enabled } }, 200);
  },
);

contextRouter.openapi(
  createRoute({
    method: "patch", path: "/{id}", tags: ["Context"], summary: "Update / toggle context row", operationId: "ctxUpdate",
    request: { params: z.object({ id: z.string() }), body: { content: { "application/json": { schema: z.object({ category: z.string().optional(), topic: z.string().optional(), content: z.string().optional(), dataSignals: z.string().nullable().optional(), homeownerAction: z.string().nullable().optional(), priority: z.number().optional(), enabled: z.boolean().optional() }) } } } },
    responses: { 200: { description: "ok", content: { "application/json": { schema: z.object({ item: ctxSchema.nullable() }) } } } },
  }),
  async (c) => {
    const [row] = await getDb(c.env).update(agenticSfContext).set({ ...c.req.valid("json"), updatedAt: new Date() }).where(eq(agenticSfContext.id, c.req.valid("param").id)).returning();
    return c.json({ item: row ? { id: row.id, category: row.category, topic: row.topic, content: row.content, dataSignals: row.dataSignals, homeownerAction: row.homeownerAction, priority: row.priority, enabled: row.enabled } : null }, 200);
  },
);

contextRouter.openapi(
  createRoute({ method: "get", path: "/health", tags: ["Context"], summary: "Health", operationId: "ctxHealth", responses: { 200: { description: "ok", content: { "application/json": { schema: z.object({ status: z.string(), count: z.number() }) } } } } }),
  async (c) => { const rows = await listContext(c.env, {}); return c.json({ status: "ok", count: rows.length }, 200); },
);

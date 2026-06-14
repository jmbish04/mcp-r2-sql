/**
 * @fileoverview Config-options REST API — data-driven, admin-editable list/enum
 * configurations (goal categories, vetting roles, permit badge colors, …).
 *
 * Mounted at `/api/config-options`.
 *
 * Routes:
 *   GET  /                 – list options (filter: ?key=, ?active=true)
 *   GET  /keys             – distinct config_key groups (+ counts)
 *   POST /                 – create an option
 *   PATCH /:id             – update / toggle active
 *   POST /seed             – idempotently insert CONFIG_OPTION_DEFAULTS
 *   GET  /health           – D1 reachability + row count
 *
 * The frontend reads active options to populate dropdowns and badge colors; the
 * self-admin page (/admin/config) drives the mutations.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, asc, eq, sql } from "drizzle-orm";

import { getDb } from "@/backend/db";
import { configOptions, CONFIG_OPTION_DEFAULTS } from "@db/schemas";

export const configOptionsRouter = new OpenAPIHono<{ Bindings: Env }>();

const optionSchema = z.object({
  id: z.string(),
  configKey: z.string(),
  value: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  color: z.string().nullable(),
  textColor: z.string().nullable(),
  sortOrder: z.number(),
  active: z.boolean(),
  metadata: z.record(z.string(), z.unknown()),
});

/** Map a DB row to the API shape (Date → not needed; drizzle returns booleans). */
function toApi(row: typeof configOptions.$inferSelect) {
  return {
    id: row.id,
    configKey: row.configKey,
    value: row.value,
    label: row.label,
    description: row.description,
    color: row.color,
    textColor: row.textColor,
    sortOrder: row.sortOrder,
    active: row.active,
    metadata: row.metadata,
  };
}

// ---------------------------------------------------------------------------
// GET / — list (optionally by key / active)
// ---------------------------------------------------------------------------

configOptionsRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    tags: ["Config"],
    summary: "List config options (filter by key / active)",
    operationId: "configOptionsList",
    request: {
      query: z.object({
        key: z.string().optional().openapi({ description: "config_key group, e.g. goal_category" }),
        active: z.enum(["true", "false"]).optional(),
      }),
    },
    responses: {
      200: { description: "Options ordered by sort_order, label.", content: { "application/json": { schema: z.object({ options: z.array(optionSchema) }) } } },
    },
  }),
  async (c) => {
    const { key, active } = c.req.valid("query");
    const conds = [];
    if (key) conds.push(eq(configOptions.configKey, key));
    if (active) conds.push(eq(configOptions.active, active === "true"));
    const rows = await getDb(c.env)
      .select()
      .from(configOptions)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(asc(configOptions.configKey), asc(configOptions.sortOrder), asc(configOptions.label));
    return c.json({ options: rows.map(toApi) }, 200);
  },
);

// ---------------------------------------------------------------------------
// GET /keys — distinct groups + counts
// ---------------------------------------------------------------------------

configOptionsRouter.openapi(
  createRoute({
    method: "get",
    path: "/keys",
    tags: ["Config"],
    summary: "Distinct config_key groups with option counts",
    operationId: "configOptionsKeys",
    responses: {
      200: { description: "Groups.", content: { "application/json": { schema: z.object({ keys: z.array(z.object({ configKey: z.string(), total: z.number(), active: z.number() })) }) } } },
    },
  }),
  async (c) => {
    const rows = await getDb(c.env)
      .select({
        configKey: configOptions.configKey,
        total: sql<number>`COUNT(*)`,
        active: sql<number>`SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END)`,
      })
      .from(configOptions)
      .groupBy(configOptions.configKey)
      .orderBy(asc(configOptions.configKey));
    return c.json({ keys: rows.map((r) => ({ configKey: r.configKey, total: Number(r.total), active: Number(r.active) })) }, 200);
  },
);

// ---------------------------------------------------------------------------
// POST / — create
// ---------------------------------------------------------------------------

configOptionsRouter.openapi(
  createRoute({
    method: "post",
    path: "/",
    tags: ["Config"],
    summary: "Create a config option",
    operationId: "configOptionsCreate",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              configKey: z.string().min(1),
              value: z.string().min(1),
              label: z.string().min(1),
              description: z.string().optional(),
              color: z.string().optional(),
              textColor: z.string().optional(),
              sortOrder: z.number().optional(),
              active: z.boolean().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: { description: "Created.", content: { "application/json": { schema: z.object({ option: optionSchema }) } } },
      409: { description: "Duplicate (config_key,value).", content: { "application/json": { schema: z.object({ error: z.string() }) } } },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    try {
      const [row] = await getDb(c.env)
        .insert(configOptions)
        .values({ ...body, updatedAt: new Date() })
        .returning();
      return c.json({ option: toApi(row) }, 200);
    } catch {
      return c.json({ error: `Option ${body.configKey}/${body.value} already exists.` }, 409);
    }
  },
);

// ---------------------------------------------------------------------------
// PATCH /:id — update / toggle
// ---------------------------------------------------------------------------

configOptionsRouter.openapi(
  createRoute({
    method: "patch",
    path: "/{id}",
    tags: ["Config"],
    summary: "Update or toggle a config option",
    operationId: "configOptionsUpdate",
    request: {
      params: z.object({ id: z.string() }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              label: z.string().optional(),
              description: z.string().nullable().optional(),
              color: z.string().nullable().optional(),
              textColor: z.string().nullable().optional(),
              sortOrder: z.number().optional(),
              active: z.boolean().optional(),
              value: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: { description: "Updated.", content: { "application/json": { schema: z.object({ option: optionSchema }) } } },
      404: { description: "Not found.", content: { "application/json": { schema: z.object({ error: z.string() }) } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const patch = c.req.valid("json");
    const [row] = await getDb(c.env)
      .update(configOptions)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(configOptions.id, id))
      .returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ option: toApi(row) }, 200);
  },
);

// ---------------------------------------------------------------------------
// POST /seed — idempotent defaults
// ---------------------------------------------------------------------------

configOptionsRouter.openapi(
  createRoute({
    method: "post",
    path: "/seed",
    tags: ["Config"],
    summary: "Idempotently insert default config options (missing rows only)",
    operationId: "configOptionsSeed",
    responses: {
      200: { description: "Seed result.", content: { "application/json": { schema: z.object({ inserted: z.number(), skipped: z.number() }) } } },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const existing = await db.select({ k: configOptions.configKey, v: configOptions.value }).from(configOptions);
    const have = new Set(existing.map((r) => `${r.k}::${r.v}`));
    const missing = CONFIG_OPTION_DEFAULTS.filter((d) => !have.has(`${d.configKey}::${d.value}`));
    // D1 caps bound parameters at ~100 per query; this table binds ~12 cols/row,
    // so insert in chunks of 8 rows (~96 params) to stay under the limit.
    const CHUNK = 8;
    for (let i = 0; i < missing.length; i += CHUNK) {
      const batch = missing.slice(i, i + CHUNK).map((m) => ({ ...m, updatedAt: new Date() }));
      await db.insert(configOptions).values(batch);
    }
    return c.json({ inserted: missing.length, skipped: CONFIG_OPTION_DEFAULTS.length - missing.length }, 200);
  },
);

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

configOptionsRouter.openapi(
  createRoute({
    method: "get",
    path: "/health",
    tags: ["Config"],
    summary: "Health: D1 reachable + option count",
    operationId: "configOptionsHealth",
    responses: {
      200: { description: "Status.", content: { "application/json": { schema: z.object({ status: z.string(), count: z.number() }) } } },
    },
  }),
  async (c) => {
    const [row] = await getDb(c.env).select({ n: sql<number>`COUNT(*)` }).from(configOptions);
    return c.json({ status: "ok", count: Number(row?.n ?? 0) }, 200);
  },
);

/**
 * @fileoverview Free-text enrichment API — Workers AI (kimi-k2.6) permit tagging.
 * Mounted at /api/enrich (+ /api/permit-tags). Sync tags a sample now; batch +
 * poll process the full corpus; results upsert into permit_tags.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, eq } from "drizzle-orm";

import { recordsToMarkdown, tagBatchPoll, tagBatchSubmit, tagSync } from "@/backend/ai/providers/permit-tagger";
import { runBlockQuery } from "@/backend/storyteller/store";
import { getDb } from "@/backend/db";
import { enrichmentRuns, permitTags } from "@db/schemas";

export const enrichRouter = new OpenAPIHono<{ Bindings: Env }>();
export const permitTagsRouter = new OpenAPIHono<{ Bindings: Env }>();

type Rec = { permitNumber: string; text: string };

/** Pull a corpus of {permitNumber,text} for a kind from R2 SQL. */
async function buildCorpus(env: Env, kind: string, limit: number): Promise<Rec[]> {
  const ns = env.R2_NAMESPACE;
  const sql =
    kind === "addenda"
      ? `SELECT permit_number, CONCAT(COALESCE(title,''),' ',COALESCE(review_results,''),' ',COALESCE(hold_description,'')) AS text FROM ${ns}.permit_addenda WHERE permit_number IS NOT NULL AND (hold_description IS NOT NULL OR review_results IS NOT NULL) LIMIT ${limit}`
      : kind === "inspection"
        ? `SELECT reference_number AS permit_number, inspection_description AS text FROM ${ns}.building_inspections WHERE inspection_description IS NOT NULL LIMIT ${limit}`
        : `SELECT permit_number, description AS text FROM ${ns}.building_permits WHERE description IS NOT NULL LIMIT ${limit}`;
  const res = await runBlockQuery(env, { mode: "inline", sql });
  if (!res.ok) throw new Error(res.errors[0]?.message ?? "corpus query failed");
  return res.rows.map((r) => ({ permitNumber: String(r.permit_number ?? ""), text: String(r.text ?? "") })).filter((r) => r.permitNumber && r.text);
}

/** Upsert tag→permit rows (chunked for D1's bound-param limit). */
async function upsertTags(env: Env, tags: { category: string; permits: string[] }[], source: string, runId: string, model: string) {
  const db = getDb(env);
  const rows = tags.flatMap((t) => (t.permits ?? []).map((pn) => ({ permitNumber: String(pn), category: t.category, source, runId, model })));
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 10) {
    const batch = rows.slice(i, i + 10);
    if (batch.length) {
      await db.insert(permitTags).values(batch).onConflictDoNothing();
      inserted += batch.length;
    }
  }
  return inserted;
}

// POST /api/enrich/sync
enrichRouter.openapi(
  createRoute({
    method: "post", path: "/sync", tags: ["Enrichment"], summary: "Tag a sample synchronously (kimi-k2.6)", operationId: "enrichSync",
    request: { body: { content: { "application/json": { schema: z.object({ kind: z.enum(["description", "addenda", "inspection"]).optional(), limit: z.number().optional(), records: z.array(z.object({ permitNumber: z.string(), text: z.string() })).optional() }) } } } },
    responses: { 200: { description: "ok", content: { "application/json": { schema: z.object({ ok: z.boolean(), kind: z.string(), permitsIn: z.number(), tags: z.array(z.object({ category: z.string(), permits: z.array(z.string()) })), inserted: z.number(), error: z.string().optional() }) } } } },
  }),
  async (c) => {
    const b = c.req.valid("json");
    const kind = b.kind ?? "description";
    try {
      const records = b.records ?? (await buildCorpus(c.env, kind, Math.min(b.limit ?? 80, 200)));
      const result = await tagSync(c.env, recordsToMarkdown(records));
      const [run] = await getDb(c.env).insert(enrichmentRuns).values({ kind, status: "done", model: c.env.MODEL_TAGGER, counts: { permits: records.length, tags: result.tags.length }, updatedAt: new Date() }).returning();
      const inserted = await upsertTags(c.env, result.tags, kind, run.id, c.env.MODEL_TAGGER);
      const debug = c.req.query("debug") === "1" ? { rawKeys: result.raw && typeof result.raw === "object" ? Object.keys(result.raw as object) : typeof result.raw, rawSample: JSON.stringify(result.raw).slice(0, 800) } : undefined;
      return c.json({ ok: true, kind, permitsIn: records.length, tags: result.tags, inserted, ...(debug ? { debug } : {}) }, 200);
    } catch (err) {
      return c.json({ ok: false, kind, permitsIn: 0, tags: [], inserted: 0, error: err instanceof Error ? err.message : String(err) }, 200);
    }
  },
);

// POST /api/enrich/batch
enrichRouter.openapi(
  createRoute({
    method: "post", path: "/batch", tags: ["Enrichment"], summary: "Submit a batch tagging job over the corpus", operationId: "enrichBatch",
    request: { body: { content: { "application/json": { schema: z.object({ kind: z.enum(["description", "addenda", "inspection"]).optional(), limit: z.number().optional(), chunkSize: z.number().optional() }) } } } },
    responses: { 200: { description: "ok", content: { "application/json": { schema: z.object({ ok: z.boolean(), runId: z.string().optional(), requestId: z.string().optional(), chunks: z.number().optional(), error: z.string().optional() }) } } } },
  }),
  async (c) => {
    const b = c.req.valid("json");
    const kind = b.kind ?? "description";
    try {
      const records = await buildCorpus(c.env, kind, Math.min(b.limit ?? 2000, 8000));
      const size = Math.min(b.chunkSize ?? 60, 120);
      const chunks: { markdown: string; externalReference: string }[] = [];
      for (let i = 0; i < records.length; i += size) {
        chunks.push({ markdown: recordsToMarkdown(records.slice(i, i + size)), externalReference: `${kind}-${i}` });
      }
      const submit = await tagBatchSubmit(c.env, chunks);
      const requestId = submit?.request_id ?? submit?.requestId ?? null;
      const [run] = await getDb(c.env).insert(enrichmentRuns).values({ kind, status: "queued", requestId, model: c.env.MODEL_TAGGER, counts: { permits: records.length, chunks: chunks.length }, updatedAt: new Date() }).returning();
      return c.json({ ok: true, runId: run.id, requestId: requestId ?? undefined, chunks: chunks.length }, 200);
    } catch (err) {
      return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 200);
    }
  },
);

// GET /api/enrich/poll?request_id=&run_id=
enrichRouter.openapi(
  createRoute({
    method: "get", path: "/poll", tags: ["Enrichment"], summary: "Poll a batch tagging job; upsert results when done", operationId: "enrichPoll",
    request: { query: z.object({ request_id: z.string(), run_id: z.string().optional(), kind: z.string().optional() }) },
    responses: { 200: { description: "ok", content: { "application/json": { schema: z.object({ status: z.string(), inserted: z.number().optional(), error: z.string().optional() }) } } } },
  }),
  async (c) => {
    const { request_id, run_id, kind } = c.req.valid("query");
    try {
      const res = await tagBatchPoll(c.env, request_id);
      const status = res?.status ?? (Array.isArray(res?.responses) || Array.isArray(res) ? "done" : "running");
      if (status !== "done" && status !== "complete") return c.json({ status: "running" }, 200);
      const responses = res?.responses ?? res?.results ?? res ?? [];
      let inserted = 0;
      const src = kind ?? "description";
      for (const item of Array.isArray(responses) ? responses : []) {
        const payload = item?.response ?? item?.result ?? item;
        const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
        if (parsed?.tags) inserted += await upsertTags(c.env, parsed.tags, src, run_id ?? request_id, c.env.MODEL_TAGGER);
      }
      if (run_id) await getDb(c.env).update(enrichmentRuns).set({ status: "done", updatedAt: new Date() }).where(eq(enrichmentRuns.id, run_id));
      return c.json({ status: "done", inserted }, 200);
    } catch (err) {
      return c.json({ status: "error", error: err instanceof Error ? err.message : String(err) }, 200);
    }
  },
);

// GET /api/permit-tags?category=&permit=
permitTagsRouter.openapi(
  createRoute({
    method: "get", path: "/", tags: ["Enrichment"], summary: "List permit tags (filter by category/permit)", operationId: "permitTagsList",
    request: { query: z.object({ category: z.string().optional(), permit: z.string().optional(), limit: z.number().optional() }) },
    responses: { 200: { description: "ok", content: { "application/json": { schema: z.object({ tags: z.array(z.record(z.string(), z.unknown())) }) } } } },
  }),
  async (c) => {
    const q = c.req.valid("query");
    const conds = [];
    if (q.category) conds.push(eq(permitTags.category, q.category));
    if (q.permit) conds.push(eq(permitTags.permitNumber, q.permit));
    const rows = await getDb(c.env).select().from(permitTags).where(conds.length ? and(...conds) : undefined).limit(Math.min(Number(q.limit) || 500, 2000));
    return c.json({ tags: rows }, 200);
  },
);

// GET /api/permit-tags/categories
permitTagsRouter.openapi(
  createRoute({ method: "get", path: "/categories", tags: ["Enrichment"], summary: "Distinct tag categories + counts", operationId: "permitTagCategories", responses: { 200: { description: "ok", content: { "application/json": { schema: z.object({ categories: z.array(z.object({ category: z.string(), count: z.number() })) }) } } } } }),
  async (c) => {
    const { sql } = await import("drizzle-orm");
    const rows = await getDb(c.env).select({ category: permitTags.category, count: sql<number>`COUNT(*)` }).from(permitTags).groupBy(permitTags.category);
    return c.json({ categories: rows.map((r) => ({ category: r.category, count: Number(r.count) })) }, 200);
  },
);

/**
 * @fileoverview D1 store helpers for the storyteller domain — shared by the
 * REST routes and the StorytellerAgent tools. Threads, messages, plans, specs,
 * filters, named queries, and idempotent seeding.
 */

import { and, asc, desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/backend/db";
import {
  agenticSfContext,
  AGENTIC_SF_CONTEXT_SEED,
  storytellerDashboardSpecs,
  storytellerDataPlans,
  storytellerMessages,
  storytellerNamedQueries,
  storytellerThreadFilters,
  storytellerThreads,
} from "@db/schemas";
import { guardSql, queryR2Sql, type R2SqlResult } from "@/backend/data-platform";
import { GLOBAL_QUERY_TEMPLATES } from "./templates";
import { bindParams, validateSpec, type DashboardSpec, type QueryRef } from "./spec";

type DB = ReturnType<typeof getDb>;
const now = () => new Date();

// --- Threads ---------------------------------------------------------------

export async function createThread(env: Env, input: Partial<typeof storytellerThreads.$inferInsert>) {
  const [row] = await getDb(env).insert(storytellerThreads).values({ ...input, updatedAt: now(), lastMessageAt: now() }).returning();
  return row;
}

export async function listThreads(env: Env) {
  return getDb(env).select().from(storytellerThreads).orderBy(desc(storytellerThreads.lastMessageAt));
}

export async function updateThread(env: Env, id: string, patch: Partial<typeof storytellerThreads.$inferInsert>) {
  const [row] = await getDb(env).update(storytellerThreads).set({ ...patch, updatedAt: now() }).where(eq(storytellerThreads.id, id)).returning();
  return row ?? null;
}

/** Full thread detail: thread + messages + latest plan + live spec + active filters. */
export async function getThreadDetail(env: Env, id: string) {
  const db = getDb(env);
  const [thread] = await db.select().from(storytellerThreads).where(eq(storytellerThreads.id, id));
  if (!thread) return null;
  const messages = await db.select().from(storytellerMessages).where(eq(storytellerMessages.threadId, id)).orderBy(asc(storytellerMessages.createdAt));
  const [latestPlan] = await db.select().from(storytellerDataPlans).where(eq(storytellerDataPlans.threadId, id)).orderBy(desc(storytellerDataPlans.version)).limit(1);
  const [liveSpec] = await db.select().from(storytellerDashboardSpecs).where(and(eq(storytellerDashboardSpecs.threadId, id), eq(storytellerDashboardSpecs.status, "live"))).orderBy(desc(storytellerDashboardSpecs.version)).limit(1);
  const [activeFilters] = await db.select().from(storytellerThreadFilters).where(and(eq(storytellerThreadFilters.threadId, id), eq(storytellerThreadFilters.isActive, true))).limit(1);
  return { thread, messages, latestPlan: latestPlan ?? null, liveSpec: liveSpec ?? null, activeFilters: activeFilters ?? null };
}

export async function touchThread(env: Env, id: string) {
  await getDb(env).update(storytellerThreads).set({ lastMessageAt: now(), updatedAt: now() }).where(eq(storytellerThreads.id, id));
}

// --- Messages --------------------------------------------------------------

export async function addMessage(env: Env, threadId: string, input: { role: string; content?: string; toolCalls?: unknown[] }) {
  const [row] = await getDb(env).insert(storytellerMessages).values({ threadId, role: input.role, content: input.content ?? "", toolCalls: input.toolCalls }).returning();
  await touchThread(env, threadId);
  return row;
}

// --- Plans -----------------------------------------------------------------

async function nextVersion(db: DB, table: typeof storytellerDataPlans | typeof storytellerDashboardSpecs, threadId: string) {
  const [r] = await db.select({ v: sql<number>`COALESCE(MAX(version),0)` }).from(table).where(eq(table.threadId, threadId));
  return Number(r?.v ?? 0) + 1;
}

export async function savePlan(env: Env, threadId: string, plan: Record<string, unknown>, fromMessageId?: string) {
  const db = getDb(env);
  await db.update(storytellerDataPlans).set({ status: "superseded" }).where(and(eq(storytellerDataPlans.threadId, threadId), eq(storytellerDataPlans.status, "proposed")));
  const version = await nextVersion(db, storytellerDataPlans, threadId);
  const [row] = await db.insert(storytellerDataPlans).values({ threadId, messageId: fromMessageId, plan, status: "proposed", version }).returning();
  return row;
}

export async function approvePlan(env: Env, threadId: string, planId: string) {
  const [row] = await getDb(env).update(storytellerDataPlans).set({ status: "approved" }).where(and(eq(storytellerDataPlans.id, planId), eq(storytellerDataPlans.threadId, threadId))).returning();
  return row ?? null;
}

// --- Specs -----------------------------------------------------------------

export async function saveSpec(env: Env, threadId: string, specInput: unknown, planId?: string) {
  const spec = validateSpec(specInput);
  const db = getDb(env);
  const version = await nextVersion(db, storytellerDashboardSpecs, threadId);
  const [row] = await db.insert(storytellerDashboardSpecs).values({ threadId, planId, spec: spec as unknown as Record<string, unknown>, version, status: "draft" }).returning();
  return row;
}

export async function approveSpec(env: Env, threadId: string, specId: string) {
  const db = getDb(env);
  await db.update(storytellerDashboardSpecs).set({ status: "superseded", updatedAt: now() }).where(and(eq(storytellerDashboardSpecs.threadId, threadId), eq(storytellerDashboardSpecs.status, "live")));
  const [row] = await db.update(storytellerDashboardSpecs).set({ status: "live", updatedAt: now() }).where(and(eq(storytellerDashboardSpecs.id, specId), eq(storytellerDashboardSpecs.threadId, threadId))).returning();
  return row ?? null;
}

/** Patch the live spec's blocks (upsert/remove) → persist a new live version. */
export async function patchSpecBlock(env: Env, threadId: string, op: "upsert" | "remove", block: { id: string; type?: string } & Record<string, unknown>) {
  const db = getDb(env);
  const [live] = await db.select().from(storytellerDashboardSpecs).where(and(eq(storytellerDashboardSpecs.threadId, threadId), eq(storytellerDashboardSpecs.status, "live"))).orderBy(desc(storytellerDashboardSpecs.version)).limit(1);
  if (!live) throw new Error("no live dashboard to edit");
  const spec = live.spec as unknown as DashboardSpec;
  const blocks = spec.blocks.filter((b) => b.id !== block.id);
  if (op === "upsert") blocks.push(block as DashboardSpec["blocks"][number]);
  const next = validateSpec({ ...spec, blocks });
  await db.update(storytellerDashboardSpecs).set({ status: "superseded", updatedAt: now() }).where(eq(storytellerDashboardSpecs.id, live.id));
  const version = await nextVersion(db, storytellerDashboardSpecs, threadId);
  const [row] = await db.insert(storytellerDashboardSpecs).values({ threadId, planId: live.planId, spec: next as unknown as Record<string, unknown>, version, status: "live" }).returning();
  return row;
}

// --- Filters ---------------------------------------------------------------

export async function getActiveFilters(env: Env, threadId: string) {
  const [row] = await getDb(env).select().from(storytellerThreadFilters).where(and(eq(storytellerThreadFilters.threadId, threadId), eq(storytellerThreadFilters.isActive, true))).limit(1);
  return row ?? null;
}

export async function setActiveFilters(env: Env, threadId: string, filters: Record<string, unknown>, label?: string) {
  const db = getDb(env);
  await db.update(storytellerThreadFilters).set({ isActive: false }).where(eq(storytellerThreadFilters.threadId, threadId));
  const [row] = await db.insert(storytellerThreadFilters).values({ threadId, filters, isActive: true, label }).returning();
  return row;
}

// --- Named queries ---------------------------------------------------------

export async function getNamedQuery(env: Env, id: string) {
  const [row] = await getDb(env).select().from(storytellerNamedQueries).where(eq(storytellerNamedQueries.id, id)).limit(1);
  return row ?? null;
}

export async function listNamedQueries(env: Env, threadId?: string) {
  const db = getDb(env);
  if (threadId) return db.select().from(storytellerNamedQueries).where(eq(storytellerNamedQueries.threadId, threadId));
  return db.select().from(storytellerNamedQueries);
}

export async function upsertNamedQuery(env: Env, q: { id?: string; threadId?: string | null; label: string; sql: string; params?: Record<string, unknown> }) {
  const db = getDb(env);
  if (q.id) {
    const existing = await getNamedQuery(env, q.id);
    if (existing) return existing;
    const [row] = await db.insert(storytellerNamedQueries).values({ id: q.id, threadId: q.threadId ?? null, label: q.label, sql: q.sql, params: q.params ?? {} }).returning();
    return row;
  }
  const [row] = await db.insert(storytellerNamedQueries).values({ threadId: q.threadId ?? null, label: q.label, sql: q.sql, params: q.params ?? {} }).returning();
  return row;
}

// --- Context ---------------------------------------------------------------

export async function listContext(env: Env, opts: { category?: string; enabledOnly?: boolean } = {}) {
  const db = getDb(env);
  const conds = [];
  if (opts.category) conds.push(eq(agenticSfContext.category, opts.category));
  if (opts.enabledOnly) conds.push(eq(agenticSfContext.enabled, true));
  return db.select().from(agenticSfContext).where(conds.length ? and(...conds) : undefined).orderBy(desc(agenticSfContext.priority), asc(agenticSfContext.category));
}

// --- Block query resolution ------------------------------------------------

/**
 * Resolve a block's QueryRef + the thread's active filter values into a guarded
 * R2 SQL run. Named queries resolve to a stored template (with declared params);
 * inline SQL is bound + guarded directly.
 */
export async function runBlockQuery(env: Env, ref: QueryRef, filterValues: Record<string, unknown> = {}): Promise<R2SqlResult> {
  let sql: string;
  let paramDefs: Record<string, { type: "string" | "number" | "date" | "enum"; default?: string | number }> = {};
  if (ref.mode === "named") {
    const nq = await getNamedQuery(env, ref.queryId);
    if (!nq) {
      return { ok: false, rows: [], schema: [], metrics: {}, requestId: null, status: 0, durationMs: 0, errors: [{ code: null, message: `unknown named query: ${ref.queryId}` }] };
    }
    sql = nq.sql;
    paramDefs = (nq.params as typeof paramDefs) ?? {};
  } else {
    sql = ref.sql;
  }
  const values = { ...filterValues, ...(ref.bind ?? {}) };
  const bound = bindParams(sql, paramDefs, values);
  const guard = guardSql(bound);
  if (!guard.allowed) {
    return { ok: false, rows: [], schema: [], metrics: {}, requestId: null, status: 400, durationMs: 0, errors: [{ code: null, message: guard.reason ?? "rejected" }] };
  }
  return queryR2Sql(env, guard.sql);
}

// --- Seeding (idempotent, D1-param-safe chunking) --------------------------

const CHUNK = 8;

/** Seed global named-query templates (ns-substituted) + agentic_sf_context. */
export async function seedStorytellerGlobals(env: Env) {
  const db = getDb(env);
  const ns = env.R2_NAMESPACE;
  let queriesInserted = 0;
  for (const t of GLOBAL_QUERY_TEMPLATES) {
    const existing = await getNamedQuery(env, t.id);
    if (existing) continue;
    await db.insert(storytellerNamedQueries).values({ id: t.id, threadId: null, label: t.label, sql: t.sql.replace(/\$\{ns\}/g, ns), params: t.params });
    queriesInserted++;
  }
  // context
  const have = new Set((await db.select({ topic: agenticSfContext.topic, category: agenticSfContext.category }).from(agenticSfContext)).map((r) => `${r.category}::${r.topic}`));
  const missing = AGENTIC_SF_CONTEXT_SEED.filter((r) => !have.has(`${r.category}::${r.topic}`));
  let contextInserted = 0;
  for (let i = 0; i < missing.length; i += CHUNK) {
    const batch = missing.slice(i, i + CHUNK).map((m) => ({
      category: m.category, topic: m.topic, content: m.content,
      dataSignals: m.data_signals, homeownerAction: m.homeowner_action, priority: m.priority, updatedAt: now(),
    }));
    await db.insert(agenticSfContext).values(batch);
    contextInserted += batch.length;
  }
  return { queriesInserted, contextInserted, contextSkipped: AGENTIC_SF_CONTEXT_SEED.length - contextInserted };
}

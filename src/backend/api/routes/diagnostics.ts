/**
 * @fileoverview Warehouse diagnostics rollup — "is data flowing and queryable?"
 *
 * Mounted at `/api/diagnostics` in `api/index.ts`.
 *
 * Route inventory:
 *   GET /        – full health rollup: catalog status + compaction, table
 *                  inventory, live COUNT(*)/freshness probe with scan metrics,
 *                  ingestion-mode assessment, recent query-log stats, and a
 *                  human-readable interpretation of known beta gotchas.
 *   GET /health  – liveness for this route family.
 *
 * Phase-0 determination (docs/cslb-schema.json): this warehouse is
 * BATCH-LOADED — no Pipelines stream/sink targets the bucket, and tables
 * carry loader-managed `ingested_at`/`ingest_run_id` columns instead of the
 * Pipelines-managed `__ingest_ts`. The rollup therefore reports batch
 * freshness (max ingested_at) rather than pipeline status.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { desc, gte, sql as dsql } from "drizzle-orm";

import {
  DISCOVERED_SCHEMA,
  getCatalogStatus,
  lastLoadedAtMs,
  listTables,
  logOperation,
  queryR2Sql,
  totalRows,
} from "@/backend/data-platform";
import { getDb } from "@/db";
import { queryLogs } from "@db/schemas";

export const diagnosticsRouter = new OpenAPIHono<{ Bindings: Env }>();

/** Probe table used for the live COUNT/freshness check (largest signal table). */
const PROBE_TABLE = "permit_contractors";

// ---------------------------------------------------------------------------
// GET / — full rollup
// ---------------------------------------------------------------------------

const rollupSchema = z.object({
  status: z.enum(["ok", "degraded", "fail"]),
  catalog: z.record(z.string(), z.unknown()),
  ingestion: z.object({
    mode: z.string(),
    evidence: z.string(),
    lastLoadedAt: z.string().nullable(),
    ageHours: z.number().nullable(),
  }),
  tables: z.object({
    expected: z.number(),
    live: z.number().nullable(),
    missing: z.array(z.string()),
    totalRowsAtDiscovery: z.number(),
  }),
  probe: z.record(z.string(), z.unknown()),
  recentQueries: z.object({
    total: z.number(),
    failed: z.number(),
    avgDurationMs: z.number().nullable(),
  }),
  interpretation: z.array(z.string()),
});

diagnosticsRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    tags: ["Diagnostics"],
    summary: "Catalog / warehouse / pipeline health rollup with interpretation",
    operationId: "diagnosticsRollup",
    responses: {
      200: { description: "Health rollup.", content: { "application/json": { schema: rollupSchema } } },
    },
  }),
  async (c) => {
    const interpretation: string[] = [];
    const ns = c.env.R2_NAMESPACE;

    // 1. Catalog status + maintenance config.
    const cat = await getCatalogStatus(c.env);
    const compactionState = cat.result?.maintenance_config?.compaction?.state ?? "unknown";
    if (!cat.ok) {
      interpretation.push(`Catalog REST unreachable (${cat.errors[0] ?? "unknown error"}) — schema browsing and maintenance checks are degraded. Verify the R2_SQL_TOKEN scopes include R2 Data Catalog Read.`);
    } else if (cat.result?.status !== "active") {
      interpretation.push(`Catalog status is "${cat.result?.status}" — queries will fail until the catalog is re-enabled (npx wrangler r2 bucket catalog enable ${c.env.R2_BUCKET}).`);
    }
    if (compactionState !== "enabled") {
      interpretation.push("Automatic compaction is NOT enabled — small-file buildup will degrade query latency over time.");
    }

    // 2. Live table inventory vs Phase-0 expectation.
    const expectedTables = Object.keys(DISCOVERED_SCHEMA.tables);
    const live = await listTables(c.env, ns);
    const liveNames = live.ok ? live.tables.map((t) => t.name) : null;
    const missing = liveNames ? expectedTables.filter((t) => !liveNames.includes(t)) : [];
    if (missing.length) {
      interpretation.push(`Tables missing from the live catalog vs Phase-0 discovery: ${missing.join(", ")}. They may have been dropped or the namespace changed.`);
    }

    // 3. Live probe: COUNT(*) + freshness on the probe table, with metrics.
    const probeSql = `SELECT COUNT(*) AS total, MAX(ingested_at) AS last_ingested_at, MAX(data_as_of) AS upstream_data_as_of FROM ${ns}.${PROBE_TABLE} LIMIT 1`;
    const probe = await queryR2Sql(c.env, probeSql);
    logOperation(c.env, {
      source: "diagnostics", operation: "probe", ok: probe.ok, status: probe.status,
      durationMs: probe.durationMs, sql: probeSql, requestId: probe.requestId,
      rowsReturned: probe.rows.length, filesScanned: probe.metrics.files_scanned,
      bytesScanned: probe.metrics.bytes_scanned, error: probe.errors[0]?.message, metadata: {},
    }, c.executionCtx);

    let probeOut: Record<string, unknown>;
    if (probe.ok) {
      const row = probe.rows[0] ?? {};
      probeOut = {
        ok: true,
        table: `${ns}.${PROBE_TABLE}`,
        total: row.total ?? null,
        lastIngestedAt: row.last_ingested_at ?? null,
        upstreamDataAsOf: row.upstream_data_as_of ?? null,
        metrics: probe.metrics,
        requestId: probe.requestId,
        durationMs: probe.durationMs,
      };
      const files = probe.metrics.files_scanned ?? 0;
      if (files > 100) {
        interpretation.push(`Probe scanned ${files} files — high file count suggests the table needs compaction (enabled tables compact up to 2 GB/hour during open beta, so backlogs take time).`);
      }
      const discovered = DISCOVERED_SCHEMA.tables[PROBE_TABLE]?.total_records ?? 0;
      const liveTotal = Number(row.total ?? 0);
      if (liveTotal > discovered) {
        interpretation.push(`Data IS flowing: ${PROBE_TABLE} grew from ${discovered} rows at discovery to ${liveTotal} now.`);
      } else if (liveTotal === discovered) {
        interpretation.push(`No new ${PROBE_TABLE} rows since Phase-0 discovery — expected for a batch-loaded warehouse between loader runs.`);
      }
    } else {
      probeOut = { ok: false, table: `${ns}.${PROBE_TABLE}`, errors: probe.errors.map((e) => e.message) };
      interpretation.push(
        probe.errors[0]?.message?.includes("R2_SQL_TOKEN")
          ? "Live SQL probe skipped: the R2_SQL_TOKEN secret is not configured yet. Set it with: npx wrangler secret put R2_SQL_TOKEN"
          : `Live SQL probe FAILED: ${probe.errors[0]?.message}. If credentials are fresh, remember new data has a ~5 minute visibility delay and metrics lag 5-10 minutes during the open beta.`,
      );
    }

    // 4. Batch freshness from Iceberg snapshots (works without R2 SQL token).
    const loadedMs = lastLoadedAtMs();
    const ageHours = loadedMs ? Math.round(((Date.now() - loadedMs) / 36e5) * 10) / 10 : null;
    if (ageHours !== null && ageHours > 24 * 7) {
      interpretation.push(`Last Iceberg commit was ${Math.round(ageHours / 24)} days ago — the batch loader has not run recently. If fresher data is expected, re-run the PyIceberg/PySpark load job.`);
    }

    // 5. Recent query-log stats from the mirrored D1 layer (last 24h).
    const db = getDb(c.env);
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const [stats] = await db
      .select({
        total: dsql<number>`COUNT(*)`,
        failed: dsql<number>`SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END)`,
        avgDurationMs: dsql<number>`AVG(duration_ms)`,
      })
      .from(queryLogs)
      .where(gte(queryLogs.createdAt, since));
    const failed = Number(stats?.failed ?? 0);
    const total = Number(stats?.total ?? 0);
    if (total > 0 && failed / total > 0.3) {
      interpretation.push(`${failed}/${total} data-platform operations failed in the last 24h — check /api/r2/health and the query_logs table for the dominant error.`);
    }

    const catOk = cat.ok && cat.result?.status === "active";
    const status: "ok" | "degraded" | "fail" =
      catOk && probe.ok ? "ok" : catOk || probe.ok || live.ok ? "degraded" : "fail";
    if (interpretation.length === 0) {
      interpretation.push("All checks green: catalog active, compaction enabled, live SQL probe succeeded, no missing tables, low error rate.");
    }

    return c.json({
      status,
      catalog: {
        status: cat.result?.status ?? "unreachable",
        compaction: cat.result?.maintenance_config?.compaction ?? null,
        snapshotExpiration: cat.result?.maintenance_config?.snapshot_expiration ?? null,
        credentialStatus: cat.result?.credential_status ?? null,
        errors: cat.errors,
      },
      ingestion: {
        mode: DISCOVERED_SCHEMA.ingestion_mode,
        evidence: "No Pipelines target this bucket; tables use loader-managed ingested_at/ingest_run_id (not Pipelines __ingest_ts).",
        lastLoadedAt: loadedMs ? new Date(loadedMs).toISOString() : null,
        ageHours,
      },
      tables: {
        expected: expectedTables.length,
        live: liveNames ? liveNames.length : null,
        missing,
        totalRowsAtDiscovery: totalRows(),
      },
      probe: probeOut,
      recentQueries: {
        total,
        failed,
        avgDurationMs: stats?.avgDurationMs != null ? Math.round(Number(stats.avgDurationMs)) : null,
      },
      interpretation,
    }, 200);
  },
);

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

diagnosticsRouter.openapi(
  createRoute({
    method: "get",
    path: "/health",
    tags: ["Diagnostics"],
    summary: "Liveness for the diagnostics route family",
    operationId: "diagnosticsHealth",
    responses: {
      200: { description: "Liveness + last log row time.", content: { "application/json": { schema: z.object({ status: z.string(), lastLogAt: z.string().nullable() }) } } },
    },
  }),
  async (c) => {
    const [last] = await getDb(c.env)
      .select({ createdAt: queryLogs.createdAt })
      .from(queryLogs)
      .orderBy(desc(queryLogs.createdAt))
      .limit(1);
    return c.json({ status: "ok", lastLogAt: last ? last.createdAt.toISOString() : null }, 200);
  },
);

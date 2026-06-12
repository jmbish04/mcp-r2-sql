/**
 * @fileoverview Anomaly-detection provider — cheap deterministic statistics
 * first, then an LLM pass (MODEL_EXTRACT family) to explain suspicious
 * columns/rows, plus operational anomalies derived from engine metrics.
 *
 * Statistical layer (no AI, always runs):
 *  - per-numeric-column: null rate, mean, stddev, z-score outliers, IQR fence
 *  - per-string-column: cardinality, dominant-value share
 * Operational layer (no AI):
 *  - high files_scanned → compaction hint
 *  - zero rows → freshness/visibility hint
 * LLM layer: receives the stats + a small sample and flags anything the
 * rules can't see (impossible dates, mismatched statuses, duplicate keys).
 */

import { z } from "zod";

import { generateStructuredOutput } from "@/backend/ai/providers/index";
import type { R2SqlMetrics } from "@/backend/data-platform";

/** One detected anomaly (statistical, operational, or LLM-flagged). */
export interface Anomaly {
  kind: "statistical" | "operational" | "semantic";
  column: string | null;
  severity: "info" | "warn" | "high";
  description: string;
}

const LlmAnomalies = z.object({
  anomalies: z.array(
    z.object({
      column: z.string().nullable().describe("Column name, or null for row/result-level issues."),
      severity: z.enum(["info", "warn", "high"]),
      description: z.string().describe("One concrete sentence describing the suspicious pattern."),
    }),
  ).describe("0-6 semantic anomalies not covered by the provided statistics."),
});

/** Compute numeric column statistics + rule-based anomalies. */
function statisticalPass(rows: Record<string, unknown>[]): { stats: Record<string, unknown>; anomalies: Anomaly[] } {
  const anomalies: Anomaly[] = [];
  const stats: Record<string, unknown> = {};
  if (rows.length === 0) return { stats, anomalies };

  const columns = Object.keys(rows[0]);
  for (const col of columns) {
    const values = rows.map((r) => r[col]);
    const nulls = values.filter((v) => v === null || v === undefined || v === "").length;
    const nullRate = nulls / values.length;
    const numeric = values.map(Number).filter((v) => Number.isFinite(v));

    if (nullRate > 0.5 && rows.length >= 10) {
      anomalies.push({ kind: "statistical", column: col, severity: "warn", description: `${col} is ${(nullRate * 100).toFixed(0)}% null/empty in this result set.` });
    }

    if (numeric.length >= 10 && numeric.length >= values.length * 0.8) {
      const mean = numeric.reduce((a, b) => a + b, 0) / numeric.length;
      const sd = Math.sqrt(numeric.reduce((a, b) => a + (b - mean) ** 2, 0) / numeric.length);
      const sorted = [...numeric].sort((a, b) => a - b);
      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      const iqr = q3 - q1;
      const outliers = sd > 0 ? numeric.filter((v) => Math.abs((v - mean) / sd) > 3) : [];
      const fenceOutliers = iqr > 0 ? numeric.filter((v) => v < q1 - 3 * iqr || v > q3 + 3 * iqr) : [];
      stats[col] = { mean: round(mean), sd: round(sd), q1, q3, min: sorted[0], max: sorted[sorted.length - 1], nullRate: round(nullRate) };
      if (outliers.length > 0) {
        anomalies.push({
          kind: "statistical", column: col, severity: outliers.length > numeric.length * 0.05 ? "high" : "warn",
          description: `${col}: ${outliers.length} value(s) beyond 3 standard deviations (mean ${round(mean)}, sd ${round(sd)}, max ${sorted[sorted.length - 1]}).`,
        });
      } else if (fenceOutliers.length > 0) {
        anomalies.push({ kind: "statistical", column: col, severity: "info", description: `${col}: ${fenceOutliers.length} value(s) outside the 3xIQR fence.` });
      }
    } else if (numeric.length < values.length * 0.2) {
      const distinct = new Set(values.map(String));
      const counts = new Map<string, number>();
      for (const v of values.map(String)) counts.set(v, (counts.get(v) ?? 0) + 1);
      const [domValue, domCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
      stats[col] = { cardinality: distinct.size, dominant: domValue.slice(0, 60), dominantShare: round(domCount / values.length) };
      if (distinct.size === 1 && rows.length >= 10) {
        anomalies.push({ kind: "statistical", column: col, severity: "info", description: `${col} has a single value ("${domValue.slice(0, 60)}") across all ${rows.length} rows.` });
      }
    }
  }
  return { stats, anomalies };
}

/** Operational anomalies derived from engine metrics — no AI involved. */
function operationalPass(rows: Record<string, unknown>[], metrics?: R2SqlMetrics): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const files = metrics?.files_scanned ?? 0;
  if (files > 100) {
    anomalies.push({
      kind: "operational", column: null, severity: "warn",
      description: `Query scanned ${files} Parquet files — the table likely needs compaction (open-beta compaction processes up to 2 GB/hour/table, so backlogs persist).`,
    });
  }
  if (rows.length === 0) {
    anomalies.push({
      kind: "operational", column: null, severity: "info",
      description: "Query returned 0 rows. If data was just loaded, remember new commits take ~5 minutes to become visible to R2 SQL.",
    });
  }
  return anomalies;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Detect anomalies in an R2 SQL result set.
 *
 * @param env - Worker bindings (AI binding).
 * @param input - The executed SQL, rows, and engine metrics.
 * @returns Combined statistical + operational + LLM-flagged anomalies, plus
 *          the computed column statistics for display.
 */
export async function detectAnomalies(
  env: Env,
  input: { sql: string; rows: Record<string, unknown>[]; metrics?: R2SqlMetrics },
): Promise<{ anomalies: Anomaly[]; stats: Record<string, unknown> }> {
  const { stats, anomalies } = statisticalPass(input.rows);
  anomalies.push(...operationalPass(input.rows, input.metrics));

  // LLM semantic pass — best-effort; statistical findings stand on their own.
  if (input.rows.length > 0) {
    try {
      const sample = input.rows.slice(0, 30);
      const llm = await generateStructuredOutput(env, {
        messages: [
          {
            role: "system",
            content: `You are a data-quality reviewer for San Francisco building-permit data. You receive column statistics and sample rows from a SQL result. Flag only concrete, evidence-backed anomalies that the statistics do not already cover (impossible dates, contradictory statuses, malformed identifiers, duplicated business keys). Reply with the JSON object only.`,
          },
          {
            role: "user",
            content: `SQL: ${input.sql}

Column statistics:
${JSON.stringify(stats)}

Already-flagged (do not repeat):
${JSON.stringify(anomalies.map((a) => a.description))}

Sample rows:
${JSON.stringify(sample)}`,
          },
        ],
        schema: LlmAnomalies,
        schemaName: "semantic_anomalies",
        temperature: 0.1,
      });
      for (const a of llm.anomalies) {
        anomalies.push({ kind: "semantic", column: a.column, severity: a.severity, description: a.description });
      }
    } catch (err) {
      console.error(JSON.stringify({ level: "WARN", message: "anomaly LLM pass failed", error: err instanceof Error ? err.message : String(err) }));
    }
  }

  return { anomalies, stats };
}

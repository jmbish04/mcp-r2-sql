/**
 * @fileoverview Chart-insight provider — a single Workers AI call that both
 * interprets a chart's underlying data and flags anomalies, purpose-built for
 * the per-chart "AI read" footers on the dashboard.
 *
 * One structured-output call (vs separate interpret + anomaly passes) keeps the
 * dashboard's fan-out cheap: N charts → N calls, not 2N.
 */

import { z } from "zod";

import { generateStructuredOutput } from "@/backend/ai/providers/index";

/** Max rows embedded in the prompt (chart datasets are already aggregated). */
const MAX_ROWS = 40;

/**
 * Anomaly items coerced to plain strings. The model occasionally returns
 * objects (e.g. `{ description: "..." }` or `{ category, note }`) instead of
 * strings; rather than fail validation we coerce: prefer a known text field,
 * else compactly stringify. Keeps the per-chart "AI read" robust.
 */
const AnomalyItem = z.union([
  z.string(),
  z
    .record(z.string(), z.unknown())
    .transform((o) => {
      for (const k of ["description", "message", "text", "note", "anomaly", "detail"]) {
        if (typeof o[k] === "string") return o[k] as string;
      }
      const vals = Object.values(o).filter((v) => typeof v === "string") as string[];
      return vals[0] ?? JSON.stringify(o);
    }),
]);

const ChartInsightOutput = z.object({
  reading: z.string().describe("1-3 sentence plain-language reading of what this chart shows. Cite concrete categories/values."),
  anomalies: z.array(AnomalyItem).describe("0-4 short plain-string notes on anomalies, skews, gaps, or data-quality concerns. Each item MUST be a string, not an object. Empty array if none."),
});

export type ChartInsightResult = z.infer<typeof ChartInsightOutput>;

/**
 * Interpret a chart's data and flag anomalies in one pass.
 *
 * @param env - Worker bindings (AI binding + MODEL_* vars).
 * @param input - chart title/description plus its (already-aggregated) rows.
 */
export async function chartInsight(
  env: Env,
  input: { title: string; description?: string; rows: Record<string, unknown>[] },
): Promise<ChartInsightResult> {
  const sample = input.rows.slice(0, MAX_ROWS);
  const userPrompt = `Chart: ${input.title}${input.description ? `\n(${input.description})` : ""}

Data rows (JSON, already aggregated):
${JSON.stringify(sample)}

Give a concise reading of what this chart says and flag any anomalies (dominant categories, long tails, suspicious zeros/nulls, skew). Be concrete — name the categories and numbers.`;

  return generateStructuredOutput(env, {
    messages: [
      {
        role: "system",
        content: `You are a data analyst reading charts built from San Francisco building-department (SF DBI) data. Reply with the JSON object only — a short "reading" and an "anomalies" array.`,
      },
      { role: "user", content: userPrompt },
    ],
    schema: ChartInsightOutput,
    schemaName: "chart_insight",
    temperature: 0.2,
  });
}

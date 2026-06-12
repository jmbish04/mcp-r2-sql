/**
 * @fileoverview Result-interpretation provider — produces a short
 * plain-language reading of an R2 SQL result set (MODEL_CHAT family).
 *
 * Input is the executed SQL, a sample of rows, and the engine metrics;
 * output is a concise summary plus highlight bullets, suitable for the
 * workbench "Interpret" action and the chat agent's interpret tool.
 */

import { z } from "zod";

import { generateStructuredOutput } from "@/backend/ai/providers/index";
import type { R2SqlMetrics } from "@/backend/data-platform";

/** Max rows embedded in the prompt (keeps token usage bounded). */
const SAMPLE_ROWS = 50;

const InterpretOutput = z.object({
  summary: z.string().describe("2-4 sentence plain-language reading of the result set."),
  highlights: z.array(z.string()).describe("0-5 short bullet observations (notable values, skews, gaps)."),
});

export type InterpretResult = z.infer<typeof InterpretOutput> & { sampledRows: number };

/**
 * Interpret an R2 SQL result set in plain language.
 *
 * @param env - Worker bindings (AI binding + MODEL_* vars).
 * @param input - The executed SQL, full row set (sampled internally), and metrics.
 */
export async function interpretResults(
  env: Env,
  input: { sql: string; rows: Record<string, unknown>[]; metrics?: R2SqlMetrics },
): Promise<InterpretResult> {
  const sample = input.rows.slice(0, SAMPLE_ROWS);
  const prompt = `SQL executed:
${input.sql}

Total rows returned: ${input.rows.length} (showing first ${sample.length})
Engine metrics: ${JSON.stringify(input.metrics ?? {})}

Rows (JSON):
${JSON.stringify(sample)}

Explain what this result set says, in plain language, for a construction-data analyst. Be concrete: name columns and values. Do not speculate beyond the data.`;

  const out = await generateStructuredOutput(env, {
    messages: [
      {
        role: "system",
        content: `You are a data analyst summarizing SQL results over San Francisco building-permit data. Reply with the JSON object only.`,
      },
      { role: "user", content: prompt },
    ],
    schema: InterpretOutput,
    schemaName: "result_interpretation",
    temperature: 0.2,
  });

  return { ...out, sampledRows: sample.length };
}

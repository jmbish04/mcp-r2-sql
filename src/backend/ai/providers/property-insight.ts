/**
 * @fileoverview Property-insight provider — one Workers AI structured call that
 * turns a property's live DataSF signals (Notices of Violation, complaints,
 * fire permits, planning review, fire inspections, permit contacts, review +
 * issuance metrics) plus the City's current review-pace baseline into a
 * homeowner-readable narrative: a hook headline, a short read, concrete
 * watch-items (red flags), a "is our permit slow or is the City busy?" read,
 * and next-step recommendations.
 *
 * Follows the data-storytelling arc (hook → context → watch → pace → action)
 * while staying grounded: red flags are triage candidates, never accusations.
 */

import { z } from "zod";

import { generateStructuredOutput } from "@/backend/ai/providers/index";

/**
 * A list item coerced to a plain string. gpt-oss sometimes returns objects
 * (e.g. `{ item: "…" }` or `{ title, detail }`) instead of strings; rather than
 * fail validation we coerce — prefer a known text field, else compact-stringify.
 */
const StringItem = z.union([
  z.string(),
  z.record(z.string(), z.unknown()).transform((o) => {
    for (const k of ["item", "text", "description", "message", "note", "detail", "title", "recommendation", "action", "step"]) {
      if (typeof o[k] === "string") return o[k] as string;
    }
    const vals = Object.values(o).filter((v) => typeof v === "string") as string[];
    return vals[0] ?? JSON.stringify(o);
  }),
]);

/**
 * Structured homeowner narrative for a watched property. All fields are optional
 * with defaults so a partial model response (gpt-oss sometimes omits fields)
 * still validates and renders — the provider backfills a headline from the
 * summary when missing.
 */
const PropertyInsightOutput = z.object({
  headline: z.string().default("").describe("One punchy sentence — the single most important takeaway for the homeowner (the hook)."),
  summary: z.string().default("").describe("2-4 sentence plain-language read of the property's permit/violation picture. Markdown allowed. Cite concrete counts."),
  watchItems: z.array(StringItem).default([]).describe("0-6 short concrete things to keep an eye on (open NOVs, complaints, expired permits, fire/sprinkler activity, planning-review triggers). Each item MUST be a plain string. Triage candidates, never accusations. Empty array if clean."),
  paceRead: z.string().default("").describe("1-2 sentences comparing this property's permits to the City's CURRENT review/issuance pace — is a delay unusual right now, or normal given how busy the City is?"),
  recommendations: z.array(StringItem).default([]).describe("1-4 short actionable next steps for the homeowner. Each item MUST be a plain string."),
});

export type PropertyInsightResult = z.infer<typeof PropertyInsightOutput>;

/** First sentence of a block of text (for a headline fallback). */
function firstSentence(text: string): string {
  const m = text.trim().match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : text).trim().slice(0, 160);
}

/** Compact, model-friendly digest of a signals + review-pace bundle. */
export interface PropertyInsightInput {
  keys: Record<string, unknown>;
  /** key → { label, count, ok, sampleRows } */
  datasets: Record<string, { label: string; count: number; ok: boolean; rows: Record<string, unknown>[] }>;
  reviewPace?: unknown;
}

/** Trim a dataset's rows to a few representative fields to keep the prompt small. */
function digestRows(rows: Record<string, unknown>[], limit = 5): Record<string, unknown>[] {
  return rows.slice(0, limit).map((r) => {
    const keep: Record<string, unknown> = {};
    for (const k of [
      "permit_number", "status", "derived_status", "description", "permit_type_definition",
      "complaint_number", "nov_category_description", "nov_item_description", "date_filed",
      "permit_address", "address", "inspection_type", "firm_name", "license_number",
      "filed_date", "issued_date", "calendar_days", "project_stage",
    ]) {
      if (r[k] !== undefined && r[k] !== null && r[k] !== "") keep[k] = r[k];
    }
    return Object.keys(keep).length ? keep : r;
  });
}

/**
 * Produce the homeowner narrative for a watched property.
 *
 * @param env - Worker bindings (AI binding + MODEL_* vars).
 * @param input - the signal bundle (counts + sample rows) + review-pace report.
 */
export async function propertyInsight(env: Env, input: PropertyInsightInput): Promise<PropertyInsightResult> {
  const counts = Object.fromEntries(
    Object.entries(input.datasets).map(([k, v]) => [k, { label: v.label, count: v.count }]),
  );
  const samples = Object.fromEntries(
    Object.entries(input.datasets)
      .filter(([, v]) => v.count > 0)
      .map(([k, v]) => [k, digestRows(v.rows)]),
  );

  const userPrompt = `Property: ${JSON.stringify(input.keys)}

Signal counts:
${JSON.stringify(counts, null, 0)}

Representative rows per non-empty signal:
${JSON.stringify(samples, null, 0)}

City review-pace baseline (how busy DBI/Planning are right now):
${JSON.stringify(input.reviewPace ?? {}, null, 0)}

Write the homeowner narrative. Lead with the most important thing. Be concrete with counts. Flag concerns as things to watch (triage candidates), never as accusations.`;

  const result = await generateStructuredOutput(env, {
    messages: [
      {
        role: "system",
        content: `You are an SF homeowner's building-permit advisor reading live SF DBI/Fire/Planning data for ONE property. Reply with the JSON object only, populating ALL fields (headline, summary, watchItems, paceRead, recommendations). Be accurate, concise, and actionable. Red-flag findings are triage candidates worth a look, never accusations of misconduct (legitimate explanations exist; OTC permits are same-day by design). Use the derived permit status when judging whether a permit is still live (completed=inactive, filed>365d=expired, filed≤365d=active).`,
      },
      { role: "user", content: userPrompt },
    ],
    schema: PropertyInsightOutput,
    schemaName: "property_insight",
    temperature: 0.2,
  });

  // Backfill a headline from the summary if the model omitted it.
  if (!result.headline && result.summary) result.headline = firstSentence(result.summary);
  return result;
}

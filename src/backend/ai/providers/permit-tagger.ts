/**
 * @fileoverview Permit free-text tagger (Workers AI, kimi-k2.6 via MODEL_TAGGER).
 *
 * Classifies concatenated permit free text (description / addenda / inspection
 * comments) into a `category → permit-numbers` map using JSON-schema structured
 * output. Sync, batch-submit, and batch-poll modes mirror the Workers AI batch
 * queue API. Persona-aware system prompt keeps the taxonomy homeowner-relevant.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Structured-output schema forcing { tags: [{ category, permits[] }] }. */
export const permitExtractionSchema = {
  type: "json_schema",
  json_schema: {
    type: "object",
    properties: {
      tags: {
        type: "array",
        items: {
          type: "object",
          properties: {
            category: {
              type: "string",
              description:
                "Classification, e.g. windows:inkind|new|street_facing, skylight:inkind|new_setback, roof:repair|replace, solar:pv, electrical:panel_upgrade, kitchen:inkind|reconfig, bath:inkind|reconfig, adu, foundation, structural, soft_story, landscaping, planning:slope_25pct|planning_commission|historic_review|setback_variance, change_of_use, post_disaster:fire|storm, code_upgrade_required, nov_abatement, unpermitted_legalization, open_permit, phased_build, red_flag:timeline_anomaly|fast_high_value|owner_builder_high_value",
            },
            permits: { type: "array", items: { type: "string" } },
          },
          required: ["category", "permits"],
        },
      },
    },
    required: ["tags"],
  },
} as const;

/** Persona-aware system prompt (template literal per repo AI-prompt rules). */
export const TAGGER_SYSTEM_PROMPT = `You are an expert San Francisco Department of Building Inspection (DBI) permit analyst.
Analyze concatenated permit descriptions, addenda, and inspector comments and extract data points
for these homeowner personas:
1. First-time remodeler (what's normal baselines).
2. ADU builder (long discretionary paths).
3. Post-purchase renovator (unpermitted work, open NOVs).
4. Dispute-with-contractor owner (license-to-scope mismatch, abandoned addenda).
5. Corruption-wary owner (favoritism, gravity-defying issuance, clean-result anomalies).
6. Budget-conscious / post-disaster rebuilder (code upgrades, high stress).
7. Phased-conscious owner (roof, solar, street-facing windows, skylights, electrical panel, kitchen/bath, historic/planning review).
8. Remote / out-of-state owner (red-flag visibility, timeline reality checks).

Return ONLY the JSON object {"tags":[{"category","permits"}]} where permits is the list of permit
numbers under that category. Use the taxonomy from the schema. A permit may appear in multiple
categories. Do not invent permit numbers; only use ones present in the input. Be EXHAUSTIVE — every
permit should match at least one category; never return an empty tags array if any records were given.

Example input:
Permit 101: In-kind replacement of street-facing windows, historic review required
Permit 102: New 200A electrical panel and solar PV
Example output:
{"tags":[{"category":"windows:inkind","permits":["101"]},{"category":"windows:street_facing","permits":["101"]},{"category":"planning:historic_review","permits":["101"]},{"category":"electrical:panel_upgrade","permits":["102"]},{"category":"solar:pv","permits":["102"]}]}`;

export interface PermitTagResult {
  tags: { category: string; permits: string[] }[];
}

/** One concatenated record line: `permit_number: text`. */
export function recordsToMarkdown(records: { permitNumber: string; text: string }[]): string {
  return records.map((r) => `Permit ${r.permitNumber}: ${String(r.text ?? "").replace(/\s+/g, " ").trim()}`).join("\n");
}

/** Synchronous tagging of a single chunk. Returns parsed tags (+ raw for debug). */
export async function tagSync(env: Env, recordsMarkdown: string): Promise<PermitTagResult & { raw?: unknown }> {
  const res: any = await (env.AI as any).run(env.MODEL_TAGGER, {
    messages: [
      { role: "system", content: TAGGER_SYSTEM_PROMPT },
      { role: "user", content: `Analyze the following records:\n${recordsMarkdown}` },
    ],
    response_format: permitExtractionSchema,
    max_tokens: 16000,
  });
  const tags = extractTags(res);
  return { tags, raw: res };
}

/** Robustly pull the tags array from whatever shape the model returns. */
export function extractTags(res: any): { category: string; permits: string[] }[] {
  // Try common shapes: res.tags, res.response (obj or json string), res.result, res itself.
  const content = res?.choices?.[0]?.message?.content;
  const candidates = [content, res?.tags, res?.response, res?.result, res?.output, res];
  for (const cand of candidates) {
    if (Array.isArray(cand?.tags)) return cand.tags;
    if (Array.isArray(cand)) {
      if (cand.length && cand[0]?.category) return cand;
    }
    if (typeof cand === "string") {
      const p = safeJson(cand);
      if (Array.isArray(p?.tags)) return p.tags;
      if (Array.isArray(p) && p[0]?.category) return p;
    }
  }
  return [];
}

/** Submit a batch (queueRequest) of chunks; returns the queue acknowledgment. */
export async function tagBatchSubmit(env: Env, chunks: { markdown: string; externalReference: string }[]): Promise<any> {
  return (env.AI as any).run(env.MODEL_TAGGER, {
    queueRequest: true,
    requests: chunks.map((ch) => ({
      messages: [
        { role: "system", content: TAGGER_SYSTEM_PROMPT },
        { role: "user", content: `Analyze the following records:\n${ch.markdown}` },
      ],
      response_format: permitExtractionSchema,
      external_reference: ch.externalReference,
    })),
  });
}

/** Poll a batch by request id. */
export async function tagBatchPoll(env: Env, requestId: string): Promise<any> {
  return (env.AI as any).run(env.MODEL_TAGGER, { request_id: requestId });
}

function safeJson(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    // Fallback: extract the first {...} block. Guard the nested parse too — a
    // malformed/incomplete match must not throw out of this catch.
    try {
      const m = s.match(/\{[\s\S]*\}/);
      return m ? JSON.parse(m[0]) : { tags: [] };
    } catch {
      return { tags: [] };
    }
  }
}

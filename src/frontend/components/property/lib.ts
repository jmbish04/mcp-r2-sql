/**
 * @fileoverview Property Watch API client — thin typed wrappers over
 * `/api/property/*`.
 */

import { apiGet, apiSend } from "@/lib/api";

import type { PropertyInsight, PropertyKeys, ReviewPace, SignalsResponse } from "./types";

/** Drop empty/undefined keys so the query string stays clean. */
function cleanKeys(keys: PropertyKeys): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(keys)) if (v && String(v).trim()) out[k] = String(v).trim();
  return out;
}

/** Fetch every watched signal for a property. */
export function getSignals(keys: PropertyKeys): Promise<SignalsResponse> {
  return apiGet<SignalsResponse>("property/signals", cleanKeys(keys));
}

/** Fetch the City review-pace baseline (issuance + completeness + planning). */
export function getReviewPace(windowDays = 90): Promise<ReviewPace> {
  return apiGet<ReviewPace>("property/dbi-workload", { windowDays });
}

/** Fetch the AI homeowner narrative for a property. */
export function getInsight(keys: PropertyKeys): Promise<{ ok: boolean; insight?: PropertyInsight; error?: string }> {
  return apiSend("POST", "property/insight", cleanKeys(keys));
}

/**
 * @fileoverview Types for the Property Watch surface — mirrors the
 * `/api/property/*` response shapes (live DataSF signals + City review-pace +
 * AI insight).
 */

/** Property identifiers a homeowner keys signals on. */
export interface PropertyKeys {
  block?: string;
  lot?: string;
  streetNumber?: string;
  streetName?: string;
  zip?: string;
}

/** One watched dataset's result within a signals bundle. */
export interface SignalDataset {
  ok: boolean;
  label: string;
  count: number;
  rows: Record<string, unknown>[];
  error?: string;
}

export interface SignalsResponse {
  keys: PropertyKeys & { parcelNumber?: string };
  datasets: Record<string, SignalDataset>;
}

/** City review-pace baseline (issuance + completeness + planning). */
export interface ReviewPace {
  windowDays: number;
  issuance: {
    ok: boolean;
    overall?: { count: number; avgDays: number | null };
    byType?: { otc_ih: string; count: number; avgDays: number | null }[];
    error?: string;
  };
  completenessCheck: { ok: boolean; count: number; avgDays: number | null; pctMetSla: number | null; error?: string };
  planningReview: {
    ok: boolean;
    byStage: { stage: string; count: number; avgDays: number | null; pctUnderDeadline: number | null }[];
    error?: string;
  };
}

export interface PropertyInsight {
  headline: string;
  summary: string;
  watchItems: string[];
  paceRead: string;
  recommendations: string[];
}

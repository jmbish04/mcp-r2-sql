/**
 * @fileoverview PropertyWatch — the top-level island for /property.
 *
 * A homeowner enters their property (block+lot and/or street address + zip) and
 * gets the full live picture: KPI signal cards, an AI read (Workers AI), the
 * City review-pace charts ("is our permit slow or is the City just busy?"), and
 * per-dataset detail tables. The property is mirrored into the URL (?block=…)
 * so a watch is shareable and survives reloads.
 *
 * Each panel fetches independently and shows its own skeleton; signals + AI read
 * + review pace load in parallel.
 */

"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { PropertyInsight } from "./PropertyInsight";
import { ReviewPaceCharts } from "./ReviewPaceCharts";
import { SignalCards } from "./SignalCards";
import { SignalSections } from "./SignalSections";
import { getInsight, getReviewPace, getSignals } from "./lib";
import type { PropertyInsight as Insight, PropertyKeys, ReviewPace, SignalsResponse } from "./types";

const FIELDS: { key: keyof PropertyKeys; label: string; placeholder: string }[] = [
  { key: "block", label: "Block", placeholder: "5934" },
  { key: "lot", label: "Lot", placeholder: "005" },
  { key: "streetNumber", label: "Street #", placeholder: "126" },
  { key: "streetName", label: "Street name", placeholder: "Colby" },
  { key: "zip", label: "ZIP", placeholder: "94134" },
];

function keysFromUrl(): PropertyKeys {
  if (typeof window === "undefined") return {};
  const p = new URLSearchParams(window.location.search);
  const out: PropertyKeys = {};
  for (const { key } of FIELDS) { const v = p.get(key); if (v) out[key] = v; }
  return out;
}

function keysToUrl(keys: PropertyKeys): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  for (const { key } of FIELDS) { const v = keys[key]; if (v) url.searchParams.set(key, v); else url.searchParams.delete(key); }
  window.history.replaceState({}, "", url.toString());
}

const hasKeys = (k: PropertyKeys) => Boolean((k.block && k.lot) || (k.streetNumber && k.streetName));

export function PropertyWatch() {
  const [draft, setDraft] = useState<PropertyKeys>({});
  const [applied, setApplied] = useState<PropertyKeys | null>(null);

  const [signals, setSignals] = useState<SignalsResponse | null>(null);
  const [pace, setPace] = useState<ReviewPace | null>(null);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loadingSignals, setLoadingSignals] = useState(false);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);

  // Hydrate from URL once on mount, and auto-run if keys are present.
  useEffect(() => {
    const fromUrl = keysFromUrl();
    setDraft(fromUrl);
    if (hasKeys(fromUrl)) void run(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = useCallback(async (keys: PropertyKeys) => {
    setApplied(keys);
    keysToUrl(keys);
    setLoadingSignals(true);
    setLoadingInsight(true);
    setInsightError(null);
    setInsight(null);

    // Signals + pace in parallel; AI read depends on nothing client-side.
    void getReviewPace().then(setPace).catch(() => setPace(null));
    void getSignals(keys)
      .then(setSignals)
      .catch(() => setSignals(null))
      .finally(() => setLoadingSignals(false));
    void getInsight(keys)
      .then((r) => { if (r.ok && r.insight) setInsight(r.insight); else setInsightError(r.error ?? "no insight"); })
      .catch((e) => setInsightError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoadingInsight(false));
  }, []);

  const canRun = hasKeys(draft);

  return (
    <div className="flex flex-col gap-6">
      {/* Property input */}
      <div className="flex flex-col gap-3 rounded-md bg-card p-4 ring-1 ring-border/40">
        <div className="flex flex-wrap items-end gap-3">
          {FIELDS.map(({ key, label, placeholder }) => (
            <div key={key} className="flex w-[8rem] flex-col gap-1.5">
              <Label htmlFor={`pk-${key}`}>{label}</Label>
              <Input
                id={`pk-${key}`}
                value={draft[key] ?? ""}
                placeholder={placeholder}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter" && canRun) void run(draft); }}
              />
            </div>
          ))}
          <Button onClick={() => void run(draft)} disabled={!canRun || loadingSignals}>
            {loadingSignals ? "Watching…" : "Watch property"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Provide <span className="font-medium">block + lot</span> (best) and/or <span className="font-medium">street number + name</span> (add ZIP for fire permits). For 126 Colby St: block 5934, lot 005.
        </p>
      </div>

      {!applied ? (
        <EmptyState />
      ) : (
        <>
          <SignalCards signals={signals} loading={loadingSignals} />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-1"><PropertyInsight insight={insight} loading={loadingInsight} error={insightError} /></div>
            <div className="lg:col-span-2"><ReviewPaceCharts pace={pace} loading={loadingSignals && !pace} /></div>
          </div>
          <SignalSections signals={signals} />
        </>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-20 text-center">
      <span className="text-4xl">🏠</span>
      <h2 className="text-lg font-semibold">Watch a property</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Enter a San Francisco property above to pull its live Notices of Violation, complaints, fire permits,
        planning-review triggers, inspections, and the contractors on record — plus an AI read of what to watch.
      </p>
    </div>
  );
}

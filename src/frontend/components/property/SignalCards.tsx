/**
 * @fileoverview SignalCards — the at-a-glance KPI row for a watched property.
 * One card per watched DataSF signal (count + intent coloring). Concern signals
 * (Notices of Violation, complaints, fire inspections) glow red when non-zero;
 * informational signals (contacts, metrics) stay neutral.
 */

"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import type { SignalsResponse } from "./types";

/** Display order + intent for each dataset key. `concern` cards turn red when >0. */
const CARD_ORDER: { key: string; short: string; icon: string; concern?: boolean }[] = [
  { key: "notices_of_violation", short: "Notices of Violation", icon: "⚠️", concern: true },
  { key: "dbi_complaints", short: "DBI Complaints", icon: "📣", concern: true },
  { key: "fire_inspections", short: "Fire Inspections", icon: "🚒", concern: true },
  { key: "fire_permits", short: "Fire Permits", icon: "🧯" },
  { key: "planning_review", short: "Planning Review", icon: "📐" },
  { key: "permit_contacts", short: "Contractors / Firms", icon: "👷" },
  { key: "review_metrics", short: "Review Steps", icon: "🗂️" },
  { key: "issuance_metrics", short: "Issued Permits", icon: "✅" },
];

export function SignalCards({ signals, loading }: { signals: SignalsResponse | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[5.5rem]" />)}
      </div>
    );
  }
  if (!signals) return null;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {CARD_ORDER.map(({ key, short, icon, concern }) => {
        const ds = signals.datasets[key];
        if (!ds) return null;
        const count = ds.count;
        const alarmed = Boolean(concern && count > 0);
        return (
          <Card
            key={key}
            className="ring-1"
            style={alarmed ? { borderColor: "var(--chart-4)", backgroundColor: "color-mix(in oklch, var(--chart-4) 10%, transparent)" } : undefined}
          >
            <CardContent className="flex flex-col gap-1 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{short}</span>
                <span aria-hidden>{icon}</span>
              </div>
              <span
                className="text-2xl font-semibold tabular-nums"
                style={alarmed ? { color: "var(--chart-4)" } : undefined}
              >
                {ds.ok ? count.toLocaleString() : "—"}
              </span>
              {!ds.ok && ds.error ? <span className="text-[10px] text-muted-foreground">unavailable</span> : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

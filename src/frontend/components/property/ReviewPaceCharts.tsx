/**
 * @fileoverview ReviewPaceCharts — the "is our permit slow, or is the City just
 * busy?" panel. Renders the City's CURRENT review-pace baseline from
 * /api/property/dbi-workload:
 *   - DBI issuance turnaround (avg days, OTC vs in-house) — bar
 *   - Planning review pace by stage (avg days, % under deadline) — bar + badge
 *   - DBI completeness-check pace (avg days, % met target) — stat
 *
 * Uses the shared blue style profile (white value labels, var(--foreground)
 * axes — never hsl(var(--foreground))).
 */

"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { AXIS_TICK, blueSeries, GRID_OPACITY, GRID_STROKE, VALUE_LABEL } from "@/lib/chart-style";

import type { ReviewPace } from "./types";

const cfg: ChartConfig = { avgDays: { label: "Avg days", color: "var(--chart-1)" } };

export function ReviewPaceCharts({ pace, loading }: { pace: ReviewPace | null; loading: boolean }) {
  if (loading) return <Skeleton className="h-[20rem] w-full" />;
  if (!pace) return null;

  const issuance = (pace.issuance.byType ?? []).map((b) => ({ name: b.otc_ih, avgDays: b.avgDays ?? 0, count: b.count }));
  const planning = (pace.planningReview.byStage ?? []).map((s) => ({
    name: s.stage.replace(/\b\w/g, (m) => m.toUpperCase()),
    avgDays: s.avgDays ?? 0,
    pct: s.pctUnderDeadline,
    count: s.count,
  }));
  const issuanceColors = blueSeries(Math.max(1, issuance.length));
  const planningColors = blueSeries(Math.max(1, planning.length));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* DBI issuance turnaround */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">DBI issuance turnaround</CardTitle>
          <p className="text-xs text-muted-foreground">
            Filed → issued, last {pace.windowDays} days · {pace.issuance.overall?.count?.toLocaleString() ?? "—"} permits
          </p>
        </CardHeader>
        <CardContent>
          {issuance.length ? (
            <ChartContainer config={cfg} className="h-[220px] w-full">
              <BarChart data={issuance} margin={{ top: 16, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeOpacity={GRID_OPACITY} />
                <XAxis dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={false} />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={32} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="avgDays" radius={[4, 4, 0, 0]}>
                  {issuance.map((_, i) => <Cell key={i} fill={issuanceColors[i]} />)}
                  <LabelList dataKey="avgDays" position="top" style={VALUE_LABEL} formatter={(v: unknown) => `${Number(v)}d`} />
                </Bar>
              </BarChart>
            </ChartContainer>
          ) : (
            <Empty msg={pace.issuance.error ?? "No issuance data."} />
          )}
        </CardContent>
      </Card>

      {/* Planning review pace by stage */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Planning review pace</CardTitle>
          <p className="text-xs text-muted-foreground">Median days by stage, last {pace.windowDays} days · % under deadline labeled</p>
        </CardHeader>
        <CardContent>
          {planning.length ? (
            <ChartContainer config={cfg} className="h-[220px] w-full">
              <BarChart data={planning} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 4 }}>
                <CartesianGrid horizontal={false} stroke={GRID_STROKE} strokeOpacity={GRID_OPACITY} />
                <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={false} width={120} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="avgDays" radius={[0, 4, 4, 0]}>
                  {planning.map((_, i) => <Cell key={i} fill={planningColors[i]} />)}
                  <LabelList dataKey="avgDays" position="right" style={VALUE_LABEL} formatter={(v: unknown) => `${Number(v)}d`} />
                </Bar>
              </BarChart>
            </ChartContainer>
          ) : (
            <Empty msg={pace.planningReview.error ?? "No planning-review data."} />
          )}
        </CardContent>
      </Card>

      {/* Completeness-check stat strip */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">DBI completeness-check pace</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-6">
          <Stat label="Avg days" value={pace.completenessCheck.avgDays != null ? `${pace.completenessCheck.avgDays}d` : "—"} />
          <Stat label="% meeting target" value={pace.completenessCheck.pctMetSla != null ? `${pace.completenessCheck.pctMetSla}%` : "—"} />
          <Stat label="Checks (window)" value={pace.completenessCheck.count?.toLocaleString() ?? "—"} />
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <p className="py-12 text-center text-sm text-muted-foreground">{msg}</p>;
}

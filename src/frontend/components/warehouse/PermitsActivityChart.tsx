/**
 * @fileoverview PermitsActivityChart — interactive "permits filed per month"
 * card (replaces the old area chart), modeled on the shadcn interactive bar
 * chart: tabbed by permit type with big-number totals in the header, a single
 * high-contrast blue bar series, value labels, and an AI-read footer.
 *
 * Live data: three guarded R2 SQL aggregates (building / electrical / plumbing
 * permits grouped by filed-month), merged by month.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, XAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { apiSend } from "@/lib/api";
import { compactNumber } from "@/lib/format";

import { ChartInsight } from "./ChartInsight";
import { InlineError } from "@/components/dashboard/shared";
import type { QueryResponse } from "./types";

/** The three permit tables we chart, each keyed by its filed-month series. */
const SERIES = [
  { key: "building", label: "Building", table: "building_permits" },
  { key: "electrical", label: "Electrical", table: "electrical_permits" },
  { key: "plumbing", label: "Plumbing", table: "plumbing_permits" },
] as const;

type SeriesKey = (typeof SERIES)[number]["key"];

/** A merged monthly row across the three permit types. */
type MonthRow = { month: string } & Partial<Record<SeriesKey, number>>;

const AXIS_TICK = { fill: "var(--foreground)", fontSize: 11 } as const;

const chartConfig: ChartConfig = {
  building: { label: "Building", color: "var(--chart-1)" },
  electrical: { label: "Electrical", color: "var(--chart-1)" },
  plumbing: { label: "Plumbing", color: "var(--chart-1)" },
};

/** Fetch one table's filed-per-month series. */
async function monthlySeries(table: string): Promise<Record<string, number>> {
  const sql = `SELECT date_trunc('month', filed_date) AS month, COUNT(*) AS n FROM sf_dbi.${table} WHERE filed_date IS NOT NULL GROUP BY date_trunc('month', filed_date) ORDER BY month LIMIT 600`;
  const res = await apiSend<QueryResponse>("POST", "r2/query", { sql });
  if (!res.ok) throw new Error(res.errors[0]?.message ?? "Query failed");
  const out: Record<string, number> = {};
  for (const r of res.rows) {
    const month = String(r.month ?? "").slice(0, 7); // YYYY-MM
    if (month) out[month] = Number(r.n ?? 0);
  }
  return out;
}

export function PermitsActivityChart() {
  const [active, setActive] = useState<SeriesKey>("building");
  const [rows, setRows] = useState<MonthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all(SERIES.map((s) => monthlySeries(s.table)));
      const months = new Set<string>();
      results.forEach((r) => Object.keys(r).forEach((m) => months.add(m)));
      const merged: MonthRow[] = [...months].sort().map((month) => {
        const row: MonthRow = { month };
        SERIES.forEach((s, i) => {
          row[s.key] = results[i][month] ?? 0;
        });
        return row;
      });
      setRows(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const t: Record<SeriesKey, number> = { building: 0, electrical: 0, plumbing: 0 };
    for (const row of rows) for (const s of SERIES) t[s.key] += row[s.key] ?? 0;
    return t;
  }, [rows]);

  // Rows for the AI read: month + active count, trimmed.
  const insightRows = useMemo(
    () => rows.map((r) => ({ month: r.month, [active]: r[active] ?? 0 })),
    [rows, active],
  );

  return (
    <Card className="py-0">
      <CardHeader className="flex flex-col items-stretch p-0! sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 pt-4 pb-3 sm:py-5">
          <CardTitle>Permits filed per month</CardTitle>
          <CardDescription>Monthly filings by permit type — live from R2 SQL.</CardDescription>
        </div>
        <div className="flex">
          {SERIES.map((s) => (
            <button
              key={s.key}
              type="button"
              data-active={active === s.key}
              className="relative flex flex-1 flex-col justify-center gap-1 px-5 py-3 text-left ring-1 ring-border/40 transition-colors data-[active=true]:bg-muted/50 sm:px-6 sm:py-4"
              onClick={() => setActive(s.key)}
            >
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <span className="text-lg font-bold tabular-nums sm:text-2xl">
                {compactNumber(totals[s.key])}
              </span>
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:p-6">
        {error ? (
          <InlineError message={error} onRetry={() => void load()} />
        ) : loading ? (
          <Skeleton className="h-[260px] w-full" />
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No filings found.</p>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[260px] w-full">
            <BarChart accessibilityLayer data={rows} margin={{ left: 8, right: 8, top: 16 }}>
              <CartesianGrid vertical={false} stroke="var(--foreground)" strokeOpacity={0.08} />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={28}
                tick={AXIS_TICK}
                tickFormatter={(value: string) => {
                  const [y, m] = value.split("-");
                  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
                }}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    className="w-[170px]"
                    labelFormatter={(value: string) => {
                      const [y, m] = String(value).split("-");
                      return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
                    }}
                  />
                }
              />
              <Bar dataKey={active} fill="var(--chart-1)" radius={3} maxBarSize={42}>
                <LabelList
                  dataKey={active}
                  position="insideTop"
                  fill="#ffffff"
                  fontSize={10}
                  fontWeight={600}
                  formatter={((v: number) => (Number(v) >= 1 ? compactNumber(Number(v)) : "")) as never}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
        <ChartInsight title="Permits filed per month" description={`Active series: ${active}`} rows={insightRows} />
      </CardContent>
    </Card>
  );
}

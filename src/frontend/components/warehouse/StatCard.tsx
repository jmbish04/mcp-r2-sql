/**
 * @fileoverview StatCard — a KPI card with an optional period-over-period
 * trend (green up / red down arrow) and a clickable info popover.
 *
 * The trend is only rendered when a genuine prior-period comparison exists
 * (the dashboard computes it from real data, e.g. year-over-year permit
 * filings); cards without a meaningful period show just the value + info.
 */

"use client";

import { Info, Minus, TrendingDown, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Period-over-period delta descriptor. */
export interface StatDelta {
  /** Signed percentage change vs the prior period. */
  pct: number;
  /** Pre-resolved direction (avoids re-deriving from pct at render). */
  direction: "up" | "down" | "flat";
  /** Short caption, e.g. "vs 2023 (2024)". */
  caption: string;
}

export interface StatCardProps {
  label: string;
  value: string;
  /** Optional trend footer. */
  delta?: StatDelta;
  /** Info popover content (e.g. "10 tables in sf_dbi"). */
  info?: React.ReactNode;
}

export function StatCard({ label, value, delta, info }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardDescription>{label}</CardDescription>
          {info ? (
            <Popover>
              <PopoverTrigger
                render={
                  <Button size="icon" variant="ghost" className="size-6 shrink-0" aria-label={`About ${label}`}>
                    <Info className="size-3.5 text-muted-foreground" />
                  </Button>
                }
              />
              <PopoverContent className="w-72 text-xs leading-relaxed">{info}</PopoverContent>
            </Popover>
          ) : null}
        </div>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        {delta ? (
          <div className="flex items-center gap-1.5 text-xs">
            {delta.direction === "up" ? (
              <TrendingUp className="size-3.5" style={{ color: "var(--chart-5)" }} aria-hidden />
            ) : delta.direction === "down" ? (
              <TrendingDown className="size-3.5" style={{ color: "var(--chart-4)" }} aria-hidden />
            ) : (
              <Minus className="size-3.5 text-muted-foreground" aria-hidden />
            )}
            <span
              className="font-medium tabular-nums"
              style={{
                color:
                  delta.direction === "up"
                    ? "var(--chart-5)"
                    : delta.direction === "down"
                      ? "var(--chart-4)"
                      : undefined,
              }}
            >
              {delta.pct > 0 ? "+" : ""}
              {delta.pct.toFixed(1)}%
            </span>
            <span className="text-muted-foreground">{delta.caption}</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">&nbsp;</span>
        )}
      </CardContent>
    </Card>
  );
}

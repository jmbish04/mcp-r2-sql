/**
 * @fileoverview BlockRenderer — fetches a block's data (named/inline query via
 * the storyteller run-block API, bound to active filters) and renders the right
 * catalog component. Shows a skeleton while loading; re-runs on filter changes.
 */

"use client";

import { useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ResultsTable } from "@/components/warehouse/ResultsTable";
import { LocationMap } from "@/components/warehouse/maps/LocationMap";
import { extractPoints } from "@/components/warehouse/maps/loader";
import { fmtNum } from "@/lib/chart-style";
import { formatCost } from "@/lib/dbi-badges";

import { ChartBlock } from "./charts/ChartBlock";
import { GanttBlock } from "./charts/GanttBlock";
import { TimelineStepsBlock } from "./charts/TimelineStepsBlock";
import { CustomBlock } from "./blocks/CustomBlock";
import { StorytellerPermitsTable } from "./blocks/StorytellerPermitsTable";
import { runBlock } from "./lib";
import type { Block } from "./types";

const SPAN: Record<number, string> = { 1: "lg:col-span-1", 2: "lg:col-span-2", 3: "lg:col-span-3", 4: "lg:col-span-4" };

function renderInline(md: string): string {
  return md;
}

export function BlockRenderer({ threadId, block, filters, refreshKey }: { threadId: string; block: Block; filters: Record<string, unknown>; refreshKey: number }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(Boolean(block.query));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!block.query || block.type === "custom") { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    runBlock(threadId, block.query, filters)
      .then((r) => { if (!cancelled) { setRows(r.ok ? r.rows : []); setError(r.ok ? null : (r.errors[0]?.message ?? "query failed")); } })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [threadId, block, filters, refreshKey]);

  const span = SPAN[block.span ?? (block.type === "narrative" || block.type === "permits_table" || block.type === "table" ? 3 : 1)] ?? "lg:col-span-1";

  const body = (() => {
    if (block.type === "narrative") return <div className="prose prose-sm prose-invert max-w-none whitespace-pre-wrap text-sm text-foreground/90">{renderInline(block.markdown ?? "")}</div>;
    if (block.type === "callout") {
      const color = block.severity === "red_flag" ? "var(--chart-4)" : block.severity === "warn" ? "var(--chart-3)" : "var(--chart-2)";
      return <div className="rounded-md p-3 text-sm ring-1" style={{ borderColor: color, color, backgroundColor: `color-mix(in oklch, ${color} 12%, transparent)` }}>{block.markdown}</div>;
    }
    if (loading) return <Skeleton className="h-[260px] w-full" />;
    if (error) return <p className="py-8 text-center text-sm text-destructive">{error}</p>;
    switch (block.type) {
      case "kpi_cards":
        return <KpiCards block={block} rows={rows} />;
      case "chart":
        return <ChartBlock family={block.chart ?? "bar"} encoding={block.encoding ?? {}} rows={rows} />;
      case "map":
        return <LocationMap points={extractPoints(rows, block.map?.labelField)} height={300} />;
      case "permits_table":
        return <StorytellerPermitsTable rows={rows} />;
      case "gantt":
        return <GanttBlock rows={rows} labelField={block.eventLabelField ?? "label"} startField={block.startField ?? "date"} endField={block.endField} />;
      case "timeline_steps":
        return <TimelineStepsBlock rows={rows} stepLabelField={block.stepLabelField ?? "label"} dateField={block.dateField ?? "date"} statusField={block.statusField} />;
      case "table":
        return <ResultsTable rows={rows} />;
      case "custom":
        return <CustomBlock threadId={threadId} block={block} filters={filters} />;
      default:
        return <p className="text-sm text-muted-foreground">Unsupported block.</p>;
    }
  })();

  return (
    <Card className={span}>
      {block.title || block.type === "kpi_cards" ? (
        <CardHeader className="pb-2">
          {block.title ? <CardTitle className="text-base">{block.title}</CardTitle> : null}
        </CardHeader>
      ) : null}
      <CardContent>{body}</CardContent>
    </Card>
  );
}

function KpiCards({ block, rows }: { block: Block; rows: Record<string, unknown>[] }) {
  const row = rows[0] ?? {};
  const fmt = (v: unknown, f?: string) => (f === "usd" ? formatCost(v) : f === "pct" ? `${(Number(v) * 100).toFixed(1)}%` : f === "days" ? `${Math.round(Number(v))}d` : fmtNum(Number(v)));
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {(block.cards ?? []).map((c, i) => (
        <div key={i} className="rounded-md bg-muted/30 p-3 ring-1 ring-border/40">
          <div className="text-xs text-muted-foreground">{c.label}</div>
          <div className="text-2xl font-semibold tabular-nums">{fmt(row[c.valueField], c.format)}</div>
        </div>
      ))}
    </div>
  );
}

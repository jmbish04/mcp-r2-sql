/**
 * @fileoverview Warehouse overview dashboard island (landing page).
 *
 * Everything on this panel is live (no mock data):
 *  - Stat cards (StatCard) from /api/diagnostics + /api/r2/schema, with a real
 *    year-over-year permits trend arrow and per-card info popovers.
 *  - An interactive "permits filed per month" row (PermitsActivityChart).
 *  - recharts panels from real R2 SQL aggregates: permits-by-status (pie with
 *    name outside / value inside), top contractors (single-blue horizontal bar
 *    with value labels), inspections-by-result (single-blue bar). Each chart
 *    has a Workers-AI "AI read" footer (ChartInsight).
 *  - The diagnostics interpretation rollup.
 *
 * Readability: pie labels force `.recharts-pie-label-text` to fill-foreground
 * (name, outside) with an inside `<LabelList>` value in fill-background; bar
 * axis ticks and value labels use fill-foreground for high contrast on dark.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, Cell, LabelList, Pie, PieChart, XAxis, YAxis } from "recharts";

import { ChartCard } from "@/components/dashboard/ChartCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { apiGet, apiSend } from "@/lib/api";
import { compactNumber, relativeTime } from "@/lib/format";

import { ChartInsight } from "./ChartInsight";
import { PermitsActivityChart } from "./PermitsActivityChart";
import { StatCard, type StatDelta } from "./StatCard";
import type { DiagnosticsResponse, QueryResponse } from "./types";

/** Five-hue palette for the (multi-color) pie. Bars use a single blue ramp. */
const PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const AXIS_TICK = { fill: "var(--foreground)", fontSize: 12 } as const;

/** A monochrome-blue ramp (all chart-1 hue, descending lightness). */
function blueRamp(i: number, n: number): string {
  const pct = Math.round(100 - (i / Math.max(1, n - 1)) * 55); // 100% → 45%
  return `color-mix(in oklch, var(--chart-1) ${pct}%, var(--background))`;
}

/** One canned aggregate panel definition. */
interface PanelDef {
  key: string;
  title: string;
  description: string;
  sql: string;
}

const PANELS: PanelDef[] = [
  {
    key: "permitsByStatus",
    title: "Building permits by status",
    description: "sf_dbi.building_permits — GROUP BY status",
    sql: "SELECT status AS name, COUNT(*) AS value FROM sf_dbi.building_permits GROUP BY status ORDER BY value DESC LIMIT 8",
  },
  {
    key: "topContractors",
    title: "Top contractors by engagements",
    description: "sf_dbi.permit_contractors — role ILIKE contractor",
    sql: "SELECT firm_name AS name, COUNT(*) AS value FROM sf_dbi.permit_contractors WHERE role ILIKE '%contractor%' GROUP BY firm_name ORDER BY value DESC LIMIT 10",
  },
  {
    key: "inspectionsByResult",
    title: "Building inspections by result",
    description: "sf_dbi.building_inspections — GROUP BY result",
    sql: "SELECT result AS name, COUNT(*) AS value FROM sf_dbi.building_inspections GROUP BY result ORDER BY value DESC LIMIT 8",
  },
];

interface PanelState {
  loading: boolean;
  error: string | null;
  rows: Record<string, unknown>[];
  bytesScanned: number;
}

/** Run one guarded query through the API. */
function runPanelQuery(sql: string): Promise<QueryResponse> {
  return apiSend<QueryResponse>("POST", "r2/query", { sql });
}

export function WarehouseDashboard() {
  const [diag, setDiag] = useState<DiagnosticsResponse | null>(null);
  const [diagError, setDiagError] = useState<string | null>(null);
  const [panels, setPanels] = useState<Record<string, PanelState>>({});
  const [yoy, setYoy] = useState<{ value: string; delta?: StatDelta; caption: string } | null>(null);

  const loadDiagnostics = useCallback(async () => {
    try {
      setDiag(await apiGet<DiagnosticsResponse>("diagnostics"));
      setDiagError(null);
    } catch (err) {
      setDiagError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const loadPanel = useCallback(async (panel: PanelDef) => {
    setPanels((p) => ({ ...p, [panel.key]: { loading: true, error: null, rows: [], bytesScanned: 0 } }));
    try {
      const res = await runPanelQuery(panel.sql);
      setPanels((p) => ({
        ...p,
        [panel.key]: {
          loading: false,
          error: res.ok ? null : (res.errors[0]?.message ?? "Query failed"),
          rows: res.rows,
          bytesScanned: res.metrics.bytes_scanned ?? 0,
        },
      }));
    } catch (err) {
      setPanels((p) => ({
        ...p,
        [panel.key]: { loading: false, error: err instanceof Error ? err.message : String(err), rows: [], bytesScanned: 0 },
      }));
    }
  }, []);

  // Year-over-year building-permit filings → a real trend arrow.
  const loadYoy = useCallback(async () => {
    try {
      const res = await runPanelQuery(
        "SELECT EXTRACT(YEAR FROM filed_date) AS yr, COUNT(*) AS n FROM sf_dbi.building_permits WHERE filed_date IS NOT NULL GROUP BY EXTRACT(YEAR FROM filed_date) ORDER BY yr DESC LIMIT 6",
      );
      if (!res.ok || res.rows.length < 2) return;
      const all = res.rows.map((r) => ({ yr: Number(r.yr), n: Number(r.n) })).filter((r) => r.yr > 0);
      // Exclude the current (partial) calendar year so the comparison is
      // complete-year vs complete-year, not "2 months of 2026 vs all of 2025".
      const currentYear = new Date().getFullYear();
      const complete = all.filter((r) => r.yr < currentYear);
      const series = complete.length >= 2 ? complete : all;
      const [latest, prior] = series; // ordered DESC
      const pct = prior.n > 0 ? ((latest.n - prior.n) / prior.n) * 100 : 0;
      setYoy({
        value: compactNumber(latest.n),
        caption: `vs ${prior.yr}`,
        delta: { pct, direction: pct > 0.5 ? "up" : pct < -0.5 ? "down" : "flat", caption: `vs ${prior.yr}` },
      });
    } catch {
      /* trend is best-effort */
    }
  }, []);

  useEffect(() => {
    void loadDiagnostics();
    void loadYoy();
    for (const panel of PANELS) void loadPanel(panel);
  }, [loadDiagnostics, loadYoy, loadPanel]);

  const totalBytesScanned = useMemo(
    () => Object.values(panels).reduce((acc, p) => acc + (p.bytesScanned ?? 0), 0),
    [panels],
  );

  const probe = (diag?.probe ?? {}) as { ok?: boolean; total?: number; lastIngestedAt?: string };
  const tableList = diag
    ? `${diag.tables.live ?? diag.tables.expected} tables in sf_dbi (${compactNumber(diag.tables.totalRowsAtDiscovery)} rows total).`
    : "Loading…";

  return (
    <div className="flex flex-col gap-6">
      {/* Status strip */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={diag?.status === "ok" ? "default" : "outline"}>
          warehouse: {diag?.status ?? (diagError ? "unreachable" : "checking…")}
        </Badge>
        <Badge variant="outline">catalog: {String(diag?.catalog?.status ?? "…")}</Badge>
        <Badge variant="outline">ingestion: {diag?.ingestion.mode ?? "…"}</Badge>
        {diagError ? <span className="text-xs text-destructive">{diagError}</span> : null}
      </div>

      {/* Stat cards — trend arrow + info popovers */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Tables in sf_dbi"
          value={diag ? String(diag.tables.live ?? diag.tables.expected) : "…"}
          info={
            <span>
              <strong>{tableList}</strong> The warehouse holds SF DBI permits, inspections,
              contractors, complaints, and review addenda — all batch-loaded Iceberg tables.
            </span>
          }
        />
        <StatCard
          label="Live rows (probe)"
          value={probe.ok ? compactNumber(Number(probe.total ?? 0)) : "n/a"}
          info={
            <span>
              Live <code>COUNT(*)</code> on <code>sf_dbi.permit_contractors</code>
              {probe.lastIngestedAt ? <> · last ingested {relativeTime(new Date(probe.lastIngestedAt))}</> : null}.
            </span>
          }
        />
        <StatCard
          label="Building permits filed"
          value={yoy?.value ?? "…"}
          delta={yoy?.delta}
          info={
            <span>
              Building permits filed in the most recent year present in the data, compared to the
              prior year ({yoy?.caption ?? "year over year"}). Source: <code>sf_dbi.building_permits.filed_date</code>.
            </span>
          }
        />
        <StatCard
          label="Last warehouse load"
          value={diag?.ingestion.lastLoadedAt ? relativeTime(new Date(diag.ingestion.lastLoadedAt)) : "…"}
          info={
            <span>
              Most recent Iceberg commit: {diag?.ingestion.lastLoadedAt ?? "unknown"}.
              Ingestion mode: {diag?.ingestion.mode ?? "?"}. This page scanned{" "}
              {compactNumber(totalBytesScanned)} bytes of R2 SQL data.
            </span>
          }
        />
      </div>

      {/* Interactive permits-filed-per-month row */}
      <PermitsActivityChart />

      {/* Charts grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Pie: name outside, value inside */}
        <PanelChart
          def={PANELS[0]}
          state={panels[PANELS[0].key]}
          onRetry={() => void loadPanel(PANELS[0])}
          render={(rows, config) => (
            <ChartContainer
              config={config}
              className="mx-auto aspect-square max-h-[300px] [&_.recharts-pie-label-text]:fill-foreground"
            >
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
                <Pie
                  data={rows}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={104}
                  labelLine
                  label={(p: { name?: string; payload?: { name?: string } }) => p.name ?? p.payload?.name ?? ""}
                >
                  {rows.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} stroke="var(--background)" strokeWidth={2} />
                  ))}
                  <LabelList
                    dataKey="value"
                    className="fill-background"
                    stroke="none"
                    fontSize={11}
                    formatter={((v: number) => compactNumber(Number(v))) as never}
                  />
                </Pie>
              </PieChart>
            </ChartContainer>
          )}
        />

        {/* Top contractors: single-blue horizontal bar with value labels */}
        <PanelChart
          def={PANELS[1]}
          state={panels[PANELS[1].key]}
          onRetry={() => void loadPanel(PANELS[1])}
          render={(rows, config) => (
            <ChartContainer config={config} className="aspect-video max-h-[320px] w-full">
              <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 40 }}>
                <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={false} hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ ...AXIS_TICK, fontSize: 10 }}
                  width={170}
                  tickLine={false}
                  axisLine={false}
                />
                <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                <Bar dataKey="value" radius={4}>
                  {rows.map((_, i) => (
                    <Cell key={i} fill={blueRamp(i, rows.length)} />
                  ))}
                  <LabelList
                    dataKey="value"
                    position="insideRight"
                    fill="#ffffff"
                    fontSize={11}
                    fontWeight={600}
                    formatter={((v: number) => compactNumber(Number(v))) as never}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        />

        {/* Inspections by result: single-blue vertical bar with value labels */}
        <PanelChart
          def={PANELS[2]}
          state={panels[PANELS[2].key]}
          onRetry={() => void loadPanel(PANELS[2])}
          render={(rows, config) => (
            <ChartContainer config={config} className="aspect-video max-h-[320px] w-full">
              <BarChart data={rows} margin={{ top: 18 }}>
                <XAxis dataKey="name" tick={{ ...AXIS_TICK, fontSize: 10 }} tickLine={false} axisLine={false} interval={0} angle={-12} textAnchor="end" height={48} />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={50} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                <Bar dataKey="value" radius={4} fill="var(--chart-1)">
                  <LabelList
                    dataKey="value"
                    position="insideTop"
                    fill="#ffffff"
                    fontSize={11}
                    fontWeight={600}
                    formatter={((v: number) => compactNumber(Number(v))) as never}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        />
      </div>

      {/* Diagnostics interpretation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Self-diagnostics</CardTitle>
          <CardDescription>Is data flowing and queryable? Live rollup from /api/diagnostics.</CardDescription>
        </CardHeader>
        <CardContent>
          {diag ? (
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
              {diag.interpretation.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{diagError ?? "Loading diagnostics…"}</p>
          )}
          {diag ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Last 24h: {diag.recentQueries.total} ops, {diag.recentQueries.failed} failed
              {diag.recentQueries.avgDurationMs != null ? `, avg ${diag.recentQueries.avgDurationMs}ms` : ""}.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

/** Chart panel wrapper: maps rows to {name,value}, renders chart + AI read. */
function PanelChart({
  def,
  state,
  onRetry,
  render,
}: {
  def: PanelDef;
  state: PanelState | undefined;
  onRetry: () => void;
  render: (rows: { name: string; value: number }[], config: ChartConfig) => React.ReactNode;
}) {
  const rows = useMemo(
    () => (state?.rows ?? []).map((r) => ({ name: String(r.name ?? "(null)"), value: Number(r.value ?? 0) })),
    [state?.rows],
  );

  const config = useMemo(() => {
    const cfg: ChartConfig = { value: { label: "count", color: PALETTE[0] } };
    rows.forEach((d, i) => {
      cfg[d.name] = { label: d.name, color: PALETTE[i % PALETTE.length] };
    });
    return cfg;
  }, [rows]);

  return (
    <ChartCard
      title={def.title}
      description={def.description}
      loading={state?.loading ?? true}
      error={state?.error ?? null}
      onRetry={onRetry}
      hasData={rows.length > 0}
    >
      {render(rows, config)}
      <ChartInsight title={def.title} description={def.description} rows={rows} />
    </ChartCard>
  );
}

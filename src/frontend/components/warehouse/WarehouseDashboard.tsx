/**
 * @fileoverview Warehouse overview dashboard island (landing page).
 *
 * Everything on this panel is live:
 *  - KPI cards from GET /api/diagnostics (live COUNT probe, freshness,
 *    catalog status, scan metrics) + GET /api/r2/schema (discovered totals).
 *  - recharts panels driven by real R2 SQL aggregates via POST /api/r2/query:
 *      permits by status (donut), permits filed per month (area),
 *      top contractors (horizontal bar), inspections by result (bar).
 *  - A diagnostics interpretation list ("is data flowing and queryable?").
 *
 * Until the R2_SQL_TOKEN secret is provisioned the SQL-backed panels surface
 * the engine's own error message — no mock data, ever.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";

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

import type { DiagnosticsResponse, QueryResponse } from "./types";

const PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const AXIS_TICK = { fill: "hsl(var(--foreground))", fontSize: 12 } as const;

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
    key: "filedPerMonth",
    title: "Permits filed per month",
    description: "Last 24 months across building permits",
    sql: "SELECT date_trunc('month', filed_date) AS month, COUNT(*) AS value FROM sf_dbi.building_permits WHERE filed_date >= '2024-06-01T00:00:00Z' GROUP BY date_trunc('month', filed_date) ORDER BY month LIMIT 30",
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
async function runPanelQuery(sql: string): Promise<QueryResponse> {
  return apiSend<QueryResponse>("POST", "r2/query", { sql });
}

export function WarehouseDashboard() {
  const [diag, setDiag] = useState<DiagnosticsResponse | null>(null);
  const [diagError, setDiagError] = useState<string | null>(null);
  const [panels, setPanels] = useState<Record<string, PanelState>>({});

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

  useEffect(() => {
    void loadDiagnostics();
    for (const panel of PANELS) void loadPanel(panel);
  }, [loadDiagnostics, loadPanel]);

  const totalBytesScanned = useMemo(
    () => Object.values(panels).reduce((acc, p) => acc + (p.bytesScanned ?? 0), 0),
    [panels],
  );

  const probe = (diag?.probe ?? {}) as { ok?: boolean; total?: number; lastIngestedAt?: string };
  const kpis = [
    {
      label: "Rows at discovery",
      value: diag ? compactNumber(diag.tables.totalRowsAtDiscovery) : "…",
      hint: `${diag?.tables.expected ?? "…"} tables in sf_dbi`,
    },
    {
      label: "Live row count (probe)",
      value: probe.ok ? compactNumber(Number(probe.total ?? 0)) : "n/a",
      hint: probe.ok ? "sf_dbi.permit_contractors COUNT(*)" : "pending R2_SQL_TOKEN",
    },
    {
      label: "Last warehouse load",
      value: diag?.ingestion.lastLoadedAt ? relativeTime(new Date(diag.ingestion.lastLoadedAt)) : "…",
      hint: diag ? `${diag.ingestion.mode}-loaded` : "",
    },
    {
      label: "Bytes scanned (this page)",
      value: compactNumber(totalBytesScanned),
      hint: "across dashboard queries",
    },
  ];

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

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="pb-2">
              <CardDescription>{kpi.label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{kpi.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{kpi.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PanelChart
          def={PANELS[0]}
          state={panels[PANELS[0].key]}
          onRetry={() => void loadPanel(PANELS[0])}
          render={(rows, config) => (
            <ChartContainer config={config} className="mx-auto aspect-square max-h-[280px]">
              <PieChart>
                <ChartTooltip cursor={false} content={<ChartTooltipContent nameKey="name" hideLabel />} />
                <Pie data={rows} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} strokeWidth={2} stroke="hsl(var(--background))">
                  {rows.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
          )}
        />
        <PanelChart
          def={PANELS[1]}
          state={panels[PANELS[1].key]}
          onRetry={() => void loadPanel(PANELS[1])}
          mapRows={(rows) =>
            rows.map((r) => ({ name: String(r.month ?? "").slice(0, 7), value: Number(r.value ?? 0) }))
          }
          render={(rows, config) => (
            <ChartContainer config={config} className="aspect-video max-h-[280px] w-full">
              <AreaChart data={rows}>
                <XAxis dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={false} />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area dataKey="value" type="monotone" fill="var(--chart-2)" fillOpacity={0.25} stroke="var(--chart-2)" />
              </AreaChart>
            </ChartContainer>
          )}
        />
        <PanelChart
          def={PANELS[2]}
          state={panels[PANELS[2].key]}
          onRetry={() => void loadPanel(PANELS[2])}
          render={(rows, config) => (
            <ChartContainer config={config} className="aspect-video max-h-[300px] w-full">
              <BarChart data={rows} layout="vertical" margin={{ left: 8 }}>
                <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ ...AXIS_TICK, fontSize: 10 }} width={170} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" radius={3}>
                  {rows.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        />
        <PanelChart
          def={PANELS[3]}
          state={panels[PANELS[3].key]}
          onRetry={() => void loadPanel(PANELS[3])}
          render={(rows, config) => (
            <ChartContainer config={config} className="aspect-video max-h-[300px] w-full">
              <BarChart data={rows}>
                <XAxis dataKey="name" tick={{ ...AXIS_TICK, fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={50} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" radius={3} fill="var(--chart-4)" />
              </BarChart>
            </ChartContainer>
          )}
        />
      </div>

      {/* Diagnostics interpretation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Self-diagnostics</CardTitle>
          <CardDescription>
            Is data flowing and queryable? Live rollup from /api/diagnostics.
          </CardDescription>
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

/** Shared chart panel wrapper: name/value rows + ChartCard chrome. */
function PanelChart({
  def,
  state,
  onRetry,
  render,
  mapRows,
}: {
  def: PanelDef;
  state: PanelState | undefined;
  onRetry: () => void;
  render: (rows: { name: string; value: number }[], config: ChartConfig) => React.ReactNode;
  mapRows?: (rows: Record<string, unknown>[]) => { name: string; value: number }[];
}) {
  const rows = useMemo(() => {
    const raw = state?.rows ?? [];
    if (mapRows) return mapRows(raw);
    return raw.map((r) => ({ name: String(r.name ?? "(null)"), value: Number(r.value ?? 0) }));
  }, [state?.rows, mapRows]);

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
    </ChartCard>
  );
}

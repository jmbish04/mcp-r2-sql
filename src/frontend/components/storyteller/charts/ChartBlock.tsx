/**
 * @fileoverview ChartBlock — renders any shadcn Recharts family from a block's
 * `chart` id + `encoding` + resolved rows, all on the shared blue style profile
 * with high-contrast white labels. Covers area/bar/line/pie/donut/radar/radial/
 * scatter + derived presets (histogram, permit_lifecycle, ranked_bar).
 */

"use client";

import { useMemo } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart,
  Pie, PieChart, PolarAngleAxis, PolarGrid, Radar, RadarChart, RadialBar, RadialBarChart,
  Scatter, ScatterChart, XAxis, YAxis, ZAxis,
} from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { AXIS_TICK, blueSeries, BLUE, fmtNum, GRID_OPACITY, GRID_STROKE, VALUE_LABEL } from "@/lib/chart-style";

import type { ChartEncoding, ChartFamily } from "../types";

interface Props {
  family: ChartFamily;
  encoding: ChartEncoding;
  rows: Record<string, unknown>[];
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function ChartBlock({ family, encoding, rows }: Props) {
  const yKeys = useMemo(() => (Array.isArray(encoding.y) ? encoding.y : encoding.y ? [encoding.y] : ["value"]), [encoding.y]);
  const xKey = encoding.x ?? "name";
  const config = useMemo<ChartConfig>(() => {
    const c: ChartConfig = {};
    yKeys.forEach((k, i) => { c[k] = { label: k, color: blueSeries(yKeys.length)[i] }; });
    return c;
  }, [yKeys]);
  const colors = blueSeries(Math.max(yKeys.length, 1));
  const labelFmt = ((v: number) => fmtNum(num(v))) as never;

  // Derived datasets
  const data = useMemo(() => {
    if (family === "histogram") {
      const vals = rows.map((r) => num(r[xKey] ?? r[yKeys[0]])).filter((v) => Number.isFinite(v));
      const bins = encoding.bins ?? 12;
      if (!vals.length) return [];
      const min = Math.min(...vals), max = Math.max(...vals), w = (max - min) / bins || 1;
      const buckets = Array.from({ length: bins }, (_, i) => ({ bin: `${fmtNum(min + i * w)}`, count: 0 }));
      for (const v of vals) buckets[Math.min(bins - 1, Math.floor((v - min) / w))].count++;
      return buckets;
    }
    if (family === "ranked_bar") {
      return [...rows].map((r) => ({ ...r })).sort((a, b) => num(b[yKeys[0]]) - num(a[yKeys[0]]));
    }
    return rows;
  }, [family, rows, xKey, yKeys, encoding.bins]);

  if (!rows.length) return <p className="py-8 text-center text-sm text-muted-foreground">No data.</p>;

  const tooltip = <ChartTooltip content={<ChartTooltipContent />} />;

  // --- Pie / Donut ---
  if (family === "pie" || family === "donut") {
    const nameKey = encoding.x ?? "name";
    const valueKey = encoding.value ?? (typeof encoding.y === "string" ? encoding.y : "value");
    const pieData = rows.map((r, i) => ({ name: String(r[nameKey] ?? "(null)"), value: num(r[valueKey]), fill: colors[i % colors.length] }));
    return (
      <ChartContainer config={{}} className="mx-auto aspect-square max-h-[300px] [&_.recharts-pie-label-text]:fill-foreground">
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
          <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={104} innerRadius={family === "donut" ? 58 : 0}
            labelLine label={(p: { name?: string }) => p.name ?? ""}>
            {pieData.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} stroke="var(--background)" strokeWidth={2} />)}
            <LabelList dataKey="value" className="fill-background" stroke="none" fontSize={11} formatter={labelFmt} />
          </Pie>
        </PieChart>
      </ChartContainer>
    );
  }

  // --- Radar ---
  if (family === "radar") {
    return (
      <ChartContainer config={config} className="mx-auto aspect-square max-h-[300px]">
        <RadarChart data={data}>
          <PolarGrid />
          <PolarAngleAxis dataKey={xKey} tick={AXIS_TICK} />
          {tooltip}
          {yKeys.map((k, i) => <Radar key={k} dataKey={k} stroke={colors[i]} fill={colors[i]} fillOpacity={0.3} />)}
        </RadarChart>
      </ChartContainer>
    );
  }

  // --- Radial ---
  if (family === "radial") {
    const valueKey = encoding.value ?? yKeys[0];
    const rd = rows.map((r, i) => ({ name: String(r[xKey] ?? i), value: num(r[valueKey]), fill: colors[i % colors.length] }));
    return (
      <ChartContainer config={{}} className="mx-auto aspect-square max-h-[300px]">
        <RadialBarChart data={rd} innerRadius={30} outerRadius={120}>
          <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
          <RadialBar dataKey="value" background>
            {rd.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
          </RadialBar>
        </RadialBarChart>
      </ChartContainer>
    );
  }

  // --- Scatter ---
  if (family === "scatter") {
    const xk = encoding.x ?? "x", yk = (typeof encoding.y === "string" ? encoding.y : "y");
    const sd = rows.map((r) => ({ x: num(r[xk]), y: num(r[yk]), name: String(r[encoding.series ?? "name"] ?? "") }));
    return (
      <ChartContainer config={{}} className="aspect-video max-h-[320px] w-full">
        <ScatterChart margin={{ left: 8, bottom: 8 }}>
          <CartesianGrid stroke={GRID_STROKE} strokeOpacity={GRID_OPACITY} />
          <XAxis type="number" dataKey="x" name={xk} tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <YAxis type="number" dataKey="y" name={yk} tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} />
          <ZAxis range={[60, 60]} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Scatter data={sd} fill={BLUE} />
        </ScatterChart>
      </ChartContainer>
    );
  }

  // --- Line family ---
  if (family === "line" || family === "line_multi" || family === "line_step") {
    return (
      <ChartContainer config={config} className="aspect-video max-h-[320px] w-full">
        <LineChart data={data} margin={{ left: 8, right: 8, top: 12 }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeOpacity={GRID_OPACITY} />
          <XAxis dataKey={xKey} tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} />
          {tooltip}
          {yKeys.map((k, i) => <Line key={k} dataKey={k} type={family === "line_step" ? "step" : "monotone"} stroke={colors[i]} strokeWidth={2} dot={false} />)}
        </LineChart>
      </ChartContainer>
    );
  }

  // --- Area family ---
  if (family === "area" || family === "area_stacked" || family === "area_step") {
    const stacked = family === "area_stacked" || encoding.stacked;
    return (
      <ChartContainer config={config} className="aspect-video max-h-[320px] w-full">
        <AreaChart data={data} margin={{ left: 8, right: 8, top: 12 }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeOpacity={GRID_OPACITY} />
          <XAxis dataKey={xKey} tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} />
          {tooltip}
          {yKeys.map((k, i) => <Area key={k} dataKey={k} type={family === "area_step" ? "step" : "monotone"} stackId={stacked ? "a" : undefined} stroke={colors[i]} fill={colors[i]} fillOpacity={0.25} />)}
        </AreaChart>
      </ChartContainer>
    );
  }

  // --- Bar families (incl horizontal, grouped, stacked, labeled, ranked, histogram, permit_lifecycle) ---
  const horizontal = family === "bar_horizontal" || family === "ranked_bar" || family === "permit_lifecycle";
  const stacked = family === "bar_stacked" || encoding.stacked;
  const barXKey = family === "histogram" ? "bin" : xKey;
  const barYKeys = family === "histogram" ? ["count"] : yKeys;
  const showLabels = encoding.valueLabels ?? (family === "bar_labeled" || family === "ranked_bar" || horizontal);

  return (
    <ChartContainer config={config} className="aspect-video max-h-[340px] w-full">
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ left: 8, right: horizontal ? 36 : 8, top: 16 }}>
        <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeOpacity={GRID_OPACITY} />
        {horizontal ? (
          <>
            <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={false} hide />
            <YAxis type="category" dataKey={barXKey} tick={{ ...AXIS_TICK, fontSize: 10 }} width={160} tickLine={false} axisLine={false} />
          </>
        ) : (
          <>
            <XAxis dataKey={barXKey} tick={{ ...AXIS_TICK, fontSize: 10 }} tickLine={false} axisLine={false} interval={0} angle={-12} textAnchor="end" height={46} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} />
          </>
        )}
        <ChartTooltip content={<ChartTooltipContent />} />
        {barYKeys.map((k, i) => (
          <Bar key={k} dataKey={k} radius={4} stackId={stacked ? "a" : undefined} fill={colors[i]}>
            {(family === "ranked_bar" || family === "histogram") && barYKeys.length === 1
              ? data.map((_, di) => <Cell key={di} fill={blueSeries(data.length)[di]} />)
              : null}
            {showLabels ? <LabelList dataKey={k} position={horizontal ? "insideRight" : "insideTop"} {...VALUE_LABEL} formatter={labelFmt} /> : null}
          </Bar>
        ))}
      </BarChart>
    </ChartContainer>
  );
}

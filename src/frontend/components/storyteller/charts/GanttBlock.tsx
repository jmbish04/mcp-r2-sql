/**
 * @fileoverview GanttBlock — a horizontal schedule of a permit's events
 * (application, approved, addenda, inspections, completed) as range bars on a
 * day axis. Dates render ISO YYYY-MM-DD only (never timestamps).
 */

"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";

import { ChartContainer } from "@/components/ui/chart";
import { AXIS_TICK, BLUE, GRID_OPACITY, GRID_STROKE } from "@/lib/chart-style";

/** ISO date (yyyy-mm-dd) or "—". */
function iso(v: unknown): string {
  const s = String(v ?? "");
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}
const dayMs = 86400000;

interface Props {
  rows: Record<string, unknown>[];
  labelField: string;
  startField: string;
  endField?: string;
}

export function GanttBlock({ rows, labelField, startField, endField }: Props) {
  const data = useMemo(() => {
    const events = rows
      .map((r) => ({ label: String(r[labelField] ?? ""), start: new Date(String(r[startField] ?? "")), end: endField ? new Date(String(r[endField] ?? r[startField])) : new Date(String(r[startField] ?? "")) }))
      .filter((e) => !Number.isNaN(e.start.getTime()));
    if (!events.length) return [];
    const min = Math.min(...events.map((e) => e.start.getTime()));
    return events.map((e) => {
      const offset = Math.round((e.start.getTime() - min) / dayMs);
      const dur = Math.max(1, Math.round(((Number.isNaN(e.end.getTime()) ? e.start.getTime() : e.end.getTime()) - e.start.getTime()) / dayMs));
      return { label: e.label, offset, duration: dur, startISO: iso(e.start.toISOString()), endISO: iso(e.end.toISOString()) };
    });
  }, [rows, labelField, startField, endField]);

  if (!data.length) return <p className="py-8 text-center text-sm text-muted-foreground">No schedule data.</p>;

  return (
    <ChartContainer config={{}} className="aspect-video max-h-[360px] w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 8 }}>
        <CartesianGrid horizontal={false} stroke={GRID_STROKE} strokeOpacity={GRID_OPACITY} />
        <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={false} label={{ value: "days from first event", position: "insideBottom", fill: "var(--foreground)", fontSize: 10 }} />
        <YAxis type="category" dataKey="label" tick={{ ...AXIS_TICK, fontSize: 10 }} width={160} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ fill: "var(--foreground)", fillOpacity: 0.06 }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <div className="rounded-md bg-card px-3 py-2 text-xs ring-1 ring-border/40">
                <div className="font-medium">{payload[0].payload.label}</div>
                <div className="text-muted-foreground">{payload[0].payload.startISO} → {payload[0].payload.endISO}</div>
              </div>
            ) : null
          }
        />
        <Bar dataKey="offset" stackId="a" fill="transparent" />
        <Bar dataKey="duration" stackId="a" fill={BLUE} radius={3} />
      </BarChart>
    </ChartContainer>
  );
}

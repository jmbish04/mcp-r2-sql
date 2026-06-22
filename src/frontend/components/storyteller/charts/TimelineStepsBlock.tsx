/**
 * @fileoverview TimelineStepsBlock — a vertical milestone timeline for a permit
 * (abui timeline-steps style): dot + connector + step label + ISO date + status.
 * Dates render ISO YYYY-MM-DD only.
 */

"use client";

import { StatusBadge } from "@/components/warehouse/permit-badges";

function iso(v: unknown): string {
  const s = String(v ?? "");
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}

interface Props {
  rows: Record<string, unknown>[];
  stepLabelField: string;
  dateField: string;
  statusField?: string;
}

export function TimelineStepsBlock({ rows, stepLabelField, dateField, statusField }: Props) {
  const steps = rows
    .map((r) => ({ label: String(r[stepLabelField] ?? ""), date: iso(r[dateField]), status: statusField ? r[statusField] : undefined }))
    .filter((s) => s.label || s.date !== "—");
  if (!steps.length) return <p className="py-8 text-center text-sm text-muted-foreground">No milestones.</p>;

  return (
    <ol className="relative ml-2 flex flex-col gap-4 border-l border-border/40 pl-6">
      {steps.map((s, i) => (
        <li key={i} className="relative">
          <span className="absolute -left-[1.65rem] top-1 size-3 rounded-full ring-2 ring-background" style={{ backgroundColor: "var(--chart-1)" }} aria-hidden />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{s.label}</span>
            {s.status != null ? <StatusBadge status={s.status} /> : null}
            <span className="ml-auto font-mono text-xs text-muted-foreground">{s.date}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

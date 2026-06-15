/**
 * @fileoverview DashboardRenderer — renders a DashboardSpec: a data-scope
 * FilterBar (with the pending-changes Save alert) + a grid of BlockRenderer.
 * Editing a filter buffers locally and shows "pending changes"; Save persists
 * the active filters and re-runs bound blocks (which show skeletons).
 */

"use client";

import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { BlockRenderer } from "./BlockRenderer";
import { setThreadFilters } from "./lib";
import type { DashboardSpec, FilterDecl } from "./types";

export function DashboardRenderer({ threadId, spec, initialFilters }: { threadId: string; spec: DashboardSpec; initialFilters: Record<string, unknown> }) {
  const defaults: Record<string, unknown> = {};
  for (const f of spec.filters ?? []) if (f.default !== undefined) defaults[f.param] = f.default;
  const [applied, setApplied] = useState<Record<string, unknown>>({ ...defaults, ...initialFilters });
  const [draft, setDraft] = useState<Record<string, unknown>>({ ...defaults, ...initialFilters });
  const [refreshKey, setRefreshKey] = useState(0);
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(draft) !== JSON.stringify(applied);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await setThreadFilters(threadId, draft);
      setApplied({ ...draft });
      setRefreshKey((k) => k + 1); // forces every bound block to refetch (skeletons)
    } finally {
      setSaving(false);
    }
  }, [threadId, draft]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{spec.title}</h2>
        {spec.subtitle ? <p className="text-sm text-muted-foreground">{spec.subtitle}</p> : null}
      </div>

      {spec.filters?.length ? (
        <div className="flex flex-col gap-3 rounded-md bg-card p-4 ring-1 ring-border/40">
          <div className="flex flex-wrap items-end gap-3">
            {spec.filters.map((f) => (
              <FilterControl key={f.id} decl={f} value={draft[f.param]} onChange={(v) => setDraft((d) => ({ ...d, [f.param]: v }))} />
            ))}
          </div>
          {dirty ? (
            <div className="flex items-center justify-between gap-3 rounded-md p-2 text-sm ring-1" style={{ color: "var(--chart-3)", borderColor: "var(--chart-3)", backgroundColor: "color-mix(in oklch, var(--chart-3) 12%, transparent)" }}>
              <span>There are pending changes to the filtered data scope — click Save to update the configuration.</span>
              <Button size="sm" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {spec.blocks.map((b) => (
          <BlockRenderer key={b.id} threadId={threadId} block={b} filters={applied} refreshKey={refreshKey} />
        ))}
      </div>
    </div>
  );
}

function FilterControl({ decl, value, onChange }: { decl: FilterDecl; value: unknown; onChange: (v: unknown) => void }) {
  if (decl.kind === "select" && decl.options) {
    return (
      <div className="flex min-w-[12rem] flex-col gap-1.5">
        <Label>{decl.label}</Label>
        <Select value={String(value ?? "")} onValueChange={(v) => onChange(v)}>
          <SelectTrigger><SelectValue placeholder={decl.label} /></SelectTrigger>
          <SelectContent>{decl.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    );
  }
  if (decl.kind === "date_range") {
    const range = (value as { from?: string; to?: string }) ?? {};
    return (
      <div className="flex flex-col gap-1.5">
        <Label>{decl.label}</Label>
        <div className="flex gap-2">
          <Input type="date" value={range.from ?? ""} onChange={(e) => onChange({ ...range, from: e.target.value })} />
          <Input type="date" value={range.to ?? ""} onChange={(e) => onChange({ ...range, to: e.target.value })} />
        </div>
      </div>
    );
  }
  // text | tags | multiselect | geo_bbox → text input
  return (
    <div className="flex min-w-[12rem] flex-col gap-1.5">
      <Label>{decl.label}</Label>
      <Input value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} placeholder={decl.label} />
    </div>
  );
}

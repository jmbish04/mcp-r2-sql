/**
 * @fileoverview ContextConfigPanel — the self-serve admin for agentic_sf_context,
 * the curated knowledge the storyteller agent reasons over (DBI culture, permit
 * gotchas, corruption red-flags, homeowner playbooks). Grouped by category with
 * inline create / edit / enable-toggle, backed by /api/context.
 */

"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiSend } from "@/lib/api";

interface ContextRow {
  id: string;
  category: string;
  topic: string;
  content: string;
  dataSignals: string | null;
  homeownerAction: string | null;
  priority: number;
  enabled: boolean;
}

type Draft = Omit<ContextRow, "id" | "enabled"> & { id?: string; enabled?: boolean };

const EMPTY: Draft = { category: "", topic: "", content: "", dataSignals: "", homeownerAction: "", priority: 0 };

export function ContextConfigPanel() {
  const [rows, setRows] = useState<ContextRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiGet<{ items: ContextRow[] }>("context");
      setRows(res.items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) => `${r.category} ${r.topic} ${r.content} ${r.dataSignals ?? ""} ${r.homeownerAction ?? ""}`.toLowerCase().includes(q))
      : rows;
    const map = new Map<string, ContextRow[]>();
    for (const r of filtered) {
      const list = map.get(r.category) ?? [];
      list.push(r);
      map.set(r.category, list);
    }
    for (const list of map.values()) list.sort((a, b) => b.priority - a.priority || a.topic.localeCompare(b.topic));
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows, search]);

  const toggle = async (row: ContextRow) => {
    await apiSend("PATCH", `context/${row.id}`, { enabled: !row.enabled });
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, enabled: !r.enabled } : r)));
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const body = {
        category: editing.category.trim(),
        topic: editing.topic.trim(),
        content: editing.content.trim(),
        dataSignals: editing.dataSignals?.trim() || null,
        homeownerAction: editing.homeownerAction?.trim() || null,
        priority: Number(editing.priority) || 0,
      };
      if (editing.id) await apiSend("PATCH", `context/${editing.id}`, body);
      else await apiSend("POST", "context", body);
      setEditing(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton className="h-[30rem] w-full" />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${rows.length} context entries…`} className="max-w-sm" />
        <Button onClick={() => setEditing({ ...EMPTY })}>+ New context entry</Button>
      </div>

      {grouped.map(([category, list]) => (
        <Card key={category}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              {category}
              <Badge variant="outline" className="text-[10px]">{list.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border/50">
            {list.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-4 py-3">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{r.topic}</span>
                    {r.priority ? <Badge variant="secondary" className="text-[10px]">p{r.priority}</Badge> : null}
                  </div>
                  <p className="text-sm text-muted-foreground">{r.content}</p>
                  {r.dataSignals ? <p className="text-xs text-[var(--chart-2)]"><span className="font-medium">Signal:</span> {r.dataSignals}</p> : null}
                  {r.homeownerAction ? <p className="text-xs text-[var(--chart-3)]"><span className="font-medium">Action:</span> {r.homeownerAction}</p> : null}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Switch checked={r.enabled} onCheckedChange={() => void toggle(r)} />
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ ...r })}>Edit</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {grouped.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No matching context entries.</p> : null}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit context entry" : "New context entry"}</DialogTitle>
          </DialogHeader>
          {editing ? (
            <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto py-2">
              <Field label="Category"><Input value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} placeholder="e.g. dbi_culture" /></Field>
              <Field label="Topic"><Input value={editing.topic} onChange={(e) => setEditing({ ...editing, topic: e.target.value })} placeholder="Short title" /></Field>
              <Field label="Content"><Textarea value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} rows={4} placeholder="What the agent should know" /></Field>
              <Field label="Data signals (optional)"><Textarea value={editing.dataSignals ?? ""} onChange={(e) => setEditing({ ...editing, dataSignals: e.target.value })} rows={2} placeholder="How this shows up in the SODA/DBI data" /></Field>
              <Field label="Homeowner action (optional)"><Textarea value={editing.homeownerAction ?? ""} onChange={(e) => setEditing({ ...editing, homeownerAction: e.target.value })} rows={2} placeholder="What the homeowner should do about it" /></Field>
              <Field label="Priority"><Input type="number" value={String(editing.priority)} onChange={(e) => setEditing({ ...editing, priority: Number(e.target.value) })} /></Field>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving || !editing?.category || !editing?.topic || !editing?.content}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

/**
 * @fileoverview ConfigOptionsAdmin — self-serve admin for the data-driven
 * config-options registry. Group tabs (goal_category, vetting_role, permit
 * badge colors, sf_neighborhood, …); per group a table to add, edit, recolor,
 * reorder, and mark options active/inactive — no redeploy.
 *
 * Backs `/admin/config`. Talks to /api/config-options.
 */

"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet, apiSend } from "@/lib/api";
import { clearConfigCache, type ConfigOption } from "@/lib/config-options";

interface KeyGroup {
  configKey: string;
  total: number;
  active: number;
}

/** Friendly labels for known groups (unknown keys show the raw key). */
const KEY_LABELS: Record<string, string> = {
  goal_category: "Goal categories (storyteller)",
  vetting_role: "Vetting roles",
  permit_trade_category: "Permit trade categories (badge colors)",
  permit_status: "Permit statuses (badge colors)",
  sf_neighborhood: "SF neighborhoods (badge colors)",
};

type Draft = Partial<ConfigOption> & { configKey: string };

export function ConfigOptionsAdmin() {
  const [keys, setKeys] = useState<KeyGroup[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [options, setOptions] = useState<ConfigOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const loadKeys = useCallback(async () => {
    try {
      const res = await apiGet<{ keys: KeyGroup[] }>("config-options/keys");
      setKeys(res.keys);
      setActiveKey((prev) => prev ?? res.keys[0]?.configKey ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const loadOptions = useCallback(async (key: string) => {
    setLoading(true);
    try {
      // active omitted -> returns active AND inactive so admins see everything.
      const res = await apiGet<{ options: ConfigOption[] }>("config-options", { key });
      setOptions(res.options);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);
  useEffect(() => {
    if (activeKey) void loadOptions(activeKey);
  }, [activeKey, loadOptions]);

  const toggleActive = useCallback(async (opt: ConfigOption) => {
    setOptions((prev) => prev.map((o) => (o.id === opt.id ? { ...o, active: !o.active } : o)));
    try {
      await apiSend("PATCH", `config-options/${opt.id}`, { active: !opt.active });
      clearConfigCache();
      void loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      if (activeKey) void loadOptions(activeKey);
    }
  }, [activeKey, loadKeys, loadOptions]);

  const save = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    try {
      if (draft.id) {
        await apiSend("PATCH", `config-options/${draft.id}`, {
          label: draft.label, description: draft.description ?? null, color: draft.color ?? null,
          textColor: draft.textColor ?? null, sortOrder: draft.sortOrder ?? 0, value: draft.value,
        });
      } else {
        await apiSend("POST", "config-options", {
          configKey: draft.configKey, value: draft.value, label: draft.label,
          description: draft.description || undefined, color: draft.color || undefined,
          textColor: draft.textColor || undefined, sortOrder: draft.sortOrder ?? 0,
          active: draft.active ?? true,
        });
      }
      clearConfigCache();
      setDraft(null);
      if (activeKey) void loadOptions(activeKey);
      void loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [draft, activeKey, loadKeys, loadOptions]);

  const seed = useCallback(async () => {
    try {
      await apiSend("POST", "config-options/seed");
      clearConfigCache();
      await loadKeys();
      if (activeKey) await loadOptions(activeKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [activeKey, loadKeys, loadOptions]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        {keys.map((k) => (
          <button
            key={k.configKey}
            type="button"
            onClick={() => setActiveKey(k.configKey)}
            className={`rounded-md px-3 py-1.5 text-sm ring-1 transition-colors ${
              activeKey === k.configKey ? "bg-muted/60 ring-foreground/30" : "ring-border/40 hover:ring-foreground/20"
            }`}
          >
            {KEY_LABELS[k.configKey] ?? k.configKey}{" "}
            <span className="text-xs text-muted-foreground">({k.active}/{k.total})</span>
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void seed()}>Seed defaults</Button>
          {activeKey ? (
            <Button size="sm" onClick={() => setDraft({ configKey: activeKey, active: true, sortOrder: options.length })}>
              + Add option
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{activeKey ? (KEY_LABELS[activeKey] ?? activeKey) : "Configurations"}</CardTitle>
          <CardDescription>
            Add, relabel, recolor, reorder, or deactivate options. Changes are live immediately — no deploy.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : options.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No options yet. Click <strong>Seed defaults</strong> or <strong>Add option</strong>.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md ring-1 ring-border/40">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">label</TableHead>
                    <TableHead className="text-xs">value</TableHead>
                    <TableHead className="text-xs">badge</TableHead>
                    <TableHead className="text-xs">sort</TableHead>
                    <TableHead className="text-xs">active</TableHead>
                    <TableHead className="text-xs">edit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {options.map((o) => (
                    <TableRow key={o.id} className={o.active ? "" : "opacity-50"}>
                      <TableCell className="text-xs font-medium">{o.label}</TableCell>
                      <TableCell className="text-xs"><code>{o.value}</code></TableCell>
                      <TableCell className="text-xs">
                        {o.color ? (
                          <Badge style={{ backgroundColor: o.color, color: o.textColor ?? "#fff" }}>{o.label}</Badge>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">{o.sortOrder}</TableCell>
                      <TableCell><Switch checked={o.active} onCheckedChange={() => void toggleActive(o)} aria-label={`Toggle ${o.label}`} /></TableCell>
                      <TableCell><Button size="sm" variant="ghost" onClick={() => setDraft({ ...o })}>Edit</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={draft !== null} onOpenChange={(open) => { if (!open) setDraft(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit option" : "Add option"}</DialogTitle>
            <DialogDescription>Group: <code>{draft?.configKey}</code></DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="flex flex-col gap-3">
              {!draft.id ? (
                <Field label="Group (config_key)">
                  <Input value={draft.configKey} onChange={(e) => setDraft({ ...draft, configKey: e.target.value })} />
                </Field>
              ) : null}
              <Field label="Value (slug)">
                <Input value={draft.value ?? ""} onChange={(e) => setDraft({ ...draft, value: e.target.value })} placeholder="e.g. roofer" />
              </Field>
              <Field label="Label">
                <Input value={draft.label ?? ""} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
              </Field>
              <Field label="Description (optional)">
                <Input value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Badge color (optional)">
                  <div className="flex items-center gap-2">
                    <Input value={draft.color ?? ""} onChange={(e) => setDraft({ ...draft, color: e.target.value })} placeholder="#7c3aed" />
                    {draft.color ? <span className="size-6 shrink-0 rounded ring-1 ring-border/40" style={{ backgroundColor: draft.color }} /> : null}
                  </div>
                </Field>
                <Field label="Text color (optional)">
                  <Input value={draft.textColor ?? ""} onChange={(e) => setDraft({ ...draft, textColor: e.target.value })} placeholder="#ffffff" />
                </Field>
              </div>
              <Field label="Sort order">
                <Input type="number" value={String(draft.sortOrder ?? 0)} onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })} />
              </Field>
              <Button onClick={() => void save()} disabled={saving || !draft.value || !draft.label || !draft.configKey}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          ) : null}
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

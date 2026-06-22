/**
 * @fileoverview ThreadSwitcher — the goal selector. Each homeowner goal is its
 * own thread; switching threads swaps the entire bespoke experience. A "New
 * goal" dialog starts a thread (optionally tagged with a goal category loaded
 * from the data-driven config registry) and hands focus to the agent so the
 * interview can begin.
 */

"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getConfigOptions, type ConfigOption } from "@/lib/config-options";

import { createThread } from "./lib";
import type { ThreadSummary } from "./types";

export function ThreadSwitcher({
  threads,
  activeId,
  onSelect,
  onCreated,
}: {
  threads: ThreadSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreated: (thread: ThreadSummary) => void;
}) {
  const [goalCategories, setGoalCategories] = useState<ConfigOption[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [goalCategory, setGoalCategory] = useState<string>("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void getConfigOptions("goal_category").then(setGoalCategories);
  }, []);

  const create = async () => {
    setCreating(true);
    try {
      const cat = goalCategories.find((g) => g.value === goalCategory);
      const { thread } = await createThread({
        title: title.trim() || cat?.label || "New goal",
        goalCategory: goalCategory || undefined,
      });
      onCreated(thread);
      onSelect(thread.id);
      setOpen(false);
      setTitle("");
      setGoalCategory("");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Goal</span>
      <Select value={activeId ?? ""} onValueChange={(v) => v && onSelect(v)}>
        <SelectTrigger className="min-w-[18rem]">
          <SelectValue placeholder={threads.length ? "Select a goal…" : "No goals yet"}>
            {(value) => threads.find((t) => t.id === value)?.title
              ?? (threads.length ? "Select a goal…" : "No goals yet")}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {threads.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              <span className="flex items-center gap-2">
                <span className="truncate">{t.title}</span>
                {t.goalCategory ? <Badge variant="outline" className="text-[10px]">{t.goalCategory}</Badge> : null}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button size="sm" variant="default">+ New goal</Button>} />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start a new goal</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="thread-title">What are you trying to do?</Label>
              <Input
                id="thread-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Plan a kitchen remodel on Mission St"
              />
            </div>
            {goalCategories.length ? (
              <div className="flex flex-col gap-1.5">
                <Label>Goal category (optional)</Label>
                <Select value={goalCategory} onValueChange={(v) => setGoalCategory(v ?? "")}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Let the agent decide" /></SelectTrigger>
                  <SelectContent alignItemWithTrigger={false} className="max-h-[16rem]">
                    {goalCategories.map((g) => (
                      <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              The agent will interview you to refine this goal, then build a bespoke dashboard. You can switch between goals anytime.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => void create()} disabled={creating}>{creating ? "Starting…" : "Start goal"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

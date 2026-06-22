/**
 * @fileoverview StorytellerApp — the top-level island that composes the whole
 * agentic homeowner experience:
 *
 *   ┌ ThreadSwitcher (pick / create a goal) ───────────────────────┐
 *   │ DashboardRenderer (the bespoke spec-driven dashboard)        │
 *   └ StorytellerAssistant (floating modal, bottom-right) ─────────┘
 *
 * It owns the active thread, loads its detail (live spec + filters), and
 * reloads on the `storyteller:refresh` event the assistant dispatches after
 * the agent mutates the plan / dashboard / filters. The active thread is kept
 * in the URL (?thread=) so goals are shareable and survive reloads.
 */

"use client";

import { useCallback, useEffect, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";

import { DashboardRenderer } from "./DashboardRenderer";
import { StorytellerAssistant } from "./StorytellerAssistant";
import { ThreadSwitcher } from "./ThreadSwitcher";
import { STORYTELLER_EVENTS } from "./events";
import { getThread, listThreads, specOf } from "./lib";
import type { ThreadDetail, ThreadSummary } from "./types";

function threadFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("thread");
}

function setUrlThread(id: string): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("thread", id);
  window.history.replaceState({}, "", url.toString());
}

export function StorytellerApp() {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Initial thread list → choose active (URL param, else most recent).
  useEffect(() => {
    let cancelled = false;
    void listThreads()
      .then(({ threads }) => {
        if (cancelled) return;
        setThreads(threads);
        const fromUrl = threadFromUrl();
        const initial = (fromUrl && threads.some((t) => t.id === fromUrl) ? fromUrl : threads[0]?.id) ?? null;
        setActiveId(initial);
      })
      .finally(() => !cancelled && setLoadingThreads(false));
    return () => { cancelled = true; };
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    try {
      const d = await getThread(id);
      setDetail(d);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  // Load detail whenever the active thread changes.
  useEffect(() => {
    if (!activeId) { setDetail(null); return; }
    setUrlThread(activeId);
    void loadDetail(activeId);
  }, [activeId, loadDetail]);

  // Reload detail when the agent mutates plan/dashboard/filters.
  useEffect(() => {
    const onRefresh = (e: Event) => {
      const id = (e as CustomEvent<{ threadId?: string }>).detail?.threadId;
      if (id && id === activeId) void loadDetail(id);
    };
    window.addEventListener(STORYTELLER_EVENTS.refresh, onRefresh);
    return () => window.removeEventListener(STORYTELLER_EVENTS.refresh, onRefresh);
  }, [activeId, loadDetail]);

  const onCreated = useCallback((thread: ThreadSummary) => {
    setThreads((prev) => [thread, ...prev.filter((t) => t.id !== thread.id)]);
  }, []);

  const spec = specOf(detail);
  const initialFilters = (detail?.activeFilters?.filters as Record<string, unknown>) ?? {};

  return (
    <div className="flex flex-col gap-6">
      <ThreadSwitcher threads={threads} activeId={activeId} onSelect={setActiveId} onCreated={onCreated} />

      {loadingThreads ? (
        <Skeleton className="h-[20rem] w-full" />
      ) : !activeId ? (
        <EmptyState />
      ) : loadingDetail && !detail ? (
        <Skeleton className="h-[20rem] w-full" />
      ) : spec ? (
        <DashboardRenderer key={activeId} threadId={activeId} spec={spec} initialFilters={initialFilters} />
      ) : (
        <AwaitingPlan />
      )}

      {activeId ? <StorytellerAssistant key={activeId} threadId={activeId} /> : null}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-20 text-center">
      <span className="text-4xl">🏠</span>
      <h2 className="text-lg font-semibold">Start your first goal</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Create a goal above — the storyteller agent will interview you about your San Francisco home project,
        then build a bespoke dashboard from DBI permit data tailored to what you need.
      </p>
    </div>
  );
}

function AwaitingPlan() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-20 text-center">
      <span className="text-4xl">💬</span>
      <h2 className="text-lg font-semibold">Let’s shape this goal</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Use the assistant in the bottom-right corner to tell the agent what you’re trying to accomplish.
        Once you approve its plan, your custom dashboard appears here.
      </p>
    </div>
  );
}

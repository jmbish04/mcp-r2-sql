/**
 * @fileoverview PropertyInsight — the Workers AI homeowner narrative panel.
 * Renders the structured insight (headline hook → summary → watch-items →
 * pace read → recommendations) from /api/property/insight, following the
 * data-storytelling arc. Markdown in the summary is rendered as formatted HTML.
 */

"use client";

import { TextMessagePartProvider } from "@assistant-ui/react";

import { MarkdownText } from "@/components/chat/MarkdownText";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import type { PropertyInsight as Insight } from "./types";

export function PropertyInsight({ insight, loading, error }: { insight: Insight | null; loading: boolean; error?: string | null }) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">AI read</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" />
        </CardContent>
      </Card>
    );
  }
  if (error) return <Card><CardContent className="py-6 text-sm text-destructive">AI read unavailable: {error}</CardContent></Card>;
  if (!insight) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">AI read</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-lg font-semibold leading-snug">{insight.headline}</p>

        {insight.summary ? (
          <div className="text-sm text-foreground/90">
            {/* Reuse the chat markdown renderer for bold/lists/links. */}
            <PlainMarkdown text={insight.summary} />
          </div>
        ) : null}

        {insight.watchItems?.length ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--chart-4)" }}>Keep an eye on</span>
            <ul className="flex flex-col gap-1">
              {insight.watchItems.map((w, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span aria-hidden style={{ color: "var(--chart-4)" }}>•</span>
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {insight.paceRead ? (
          <div className="rounded-md p-3 text-sm ring-1" style={{ borderColor: "var(--chart-1)", backgroundColor: "color-mix(in oklch, var(--chart-1) 10%, transparent)" }}>
            <span className="font-medium">Timeline vs City pace: </span>{insight.paceRead}
          </div>
        ) : null}

        {insight.recommendations?.length ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Suggested next steps</span>
            <ul className="flex flex-col gap-1">
              {insight.recommendations.map((r, i) => (
                <li key={i} className="flex gap-2 text-sm"><span aria-hidden style={{ color: "var(--chart-2)" }}>✓</span><span>{r}</span></li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Render a markdown string via the assistant-ui MarkdownText primitive by
 * staging it through a TextMessagePartProvider so it gets the same dark-theme
 * prose treatment as chat.
 */
function PlainMarkdown({ text }: { text: string }) {
  return (
    <TextMessagePartProvider text={text} isRunning={false}>
      <MarkdownText />
    </TextMessagePartProvider>
  );
}

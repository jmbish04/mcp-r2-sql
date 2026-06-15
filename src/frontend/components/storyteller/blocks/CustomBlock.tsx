/**
 * @fileoverview CustomBlock — the hybrid escape hatch. Posts the block's prompt
 * + query to /api/storyteller/threads/:id/custom, where AI composes a catalog
 * chart (family + encoding) over the resolved rows (an inert spec — no code
 * execution). Renders it with the shared ChartBlock.
 */

"use client";

import { useEffect, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { apiSend } from "@/lib/api";

import { ChartBlock } from "../charts/ChartBlock";
import type { Block, ChartEncoding, ChartFamily } from "../types";

export function CustomBlock({ threadId, block, filters }: { threadId: string; block: Block; filters: Record<string, unknown> }) {
  const [state, setState] = useState<{ family: ChartFamily; encoding: ChartEncoding; rows: Record<string, unknown>[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiSend<{ ok: boolean; family?: ChartFamily; encoding?: ChartEncoding; rows: Record<string, unknown>[]; error?: string }>(
      "POST", `storyteller/threads/${threadId}/custom`, { prompt: block.prompt ?? block.title ?? "", query: block.query, filters },
    )
      .then((r) => {
        if (cancelled) return;
        if (r.ok && r.family && r.encoding) setState({ family: r.family, encoding: r.encoding, rows: r.rows });
        else setError(r.error ?? "Could not compose a chart.");
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [threadId, block, filters]);

  if (loading) return <Skeleton className="h-[280px] w-full" />;
  if (error || !state) return <p className="py-8 text-center text-sm text-muted-foreground">{error ?? "No chart."}</p>;
  return <ChartBlock family={state.family} encoding={state.encoding} rows={state.rows} />;
}

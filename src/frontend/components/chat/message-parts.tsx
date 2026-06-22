/**
 * @fileoverview Assistant-ui message-part renderers so tool-calling turns are
 * visible instead of showing a blank bubble:
 *   - ToolFallback   → a compact "running / done / failed" row per tool call
 *   - ReasoningPart  → the model's thinking, dimmed + collapsible
 *   - EmptyResponse  → shown when an assistant turn produced no renderable parts
 */

"use client";

import type { ReasoningMessagePartProps, ToolCallMessagePartProps } from "@assistant-ui/react";
import { CheckIcon, ChevronRightIcon, Loader2Icon, WrenchIcon, XIcon } from "lucide-react";

/** Human-friendly labels for the storyteller/analytics tools. */
const TOOL_LABELS: Record<string, string> = {
  geocode_address: "Looking up the address",
  list_context: "Pulling SF DBI context",
  set_goal: "Setting the goal",
  save_data_plan: "Drafting the plan",
  propose_dashboard: "Designing the dashboard",
  approve_dashboard: "Publishing the dashboard",
  update_dashboard_block: "Updating a dashboard block",
  set_filters: "Applying filters",
  find_similar_permits: "Finding similar permits",
  inspector_profile: "Profiling inspectors",
  contractor_reputation: "Checking contractor reputation",
  permit_timeline: "Building the permit timeline",
  redflag_scan: "Scanning for red flags",
  find_permits_by_tag: "Searching tagged permits",
  run_query: "Querying the warehouse",
  nl_to_sql: "Translating to SQL",
  describe_schema: "Reading the schema",
  interpret_results: "Interpreting results",
  detect_anomalies: "Detecting anomalies",
  suggest_queries: "Suggesting queries",
  lookup_permits: "Looking up permits",
  vet_contractor: "Vetting the contractor",
};

function labelFor(toolName: string): string {
  return TOOL_LABELS[toolName] ?? toolName.replace(/_/g, " ");
}

/** A failed tool result is `{ ok: false, error }` in this app's tools. */
function toolError(result: unknown): string | null {
  if (result && typeof result === "object") {
    const r = result as { ok?: boolean; error?: unknown };
    if (r.ok === false) return typeof r.error === "string" ? r.error : "failed";
  }
  return null;
}

export function ToolFallback({ toolName, result, status }: ToolCallMessagePartProps) {
  const running = status?.type === "running";
  const err = toolError(result);
  const color = err ? "var(--chart-4)" : running ? "var(--muted-foreground)" : "var(--chart-2)";
  return (
    <div className="my-1 flex items-center gap-2 text-xs" style={{ color }}>
      {running ? (
        <Loader2Icon className="size-3.5 animate-spin" />
      ) : err ? (
        <XIcon className="size-3.5" />
      ) : (
        <CheckIcon className="size-3.5" />
      )}
      <WrenchIcon className="size-3 opacity-60" />
      <span className="font-medium">{labelFor(toolName)}</span>
      {err ? <span className="opacity-80">— {err}</span> : null}
    </div>
  );
}

export function ReasoningPart({ text }: ReasoningMessagePartProps) {
  if (!text?.trim()) return null;
  return (
    <details className="my-1 text-xs text-muted-foreground">
      <summary className="flex cursor-pointer list-none items-center gap-1 opacity-70 hover:opacity-100">
        <ChevronRightIcon className="size-3 transition-transform [details[open]_&]:rotate-90" />
        Thinking
      </summary>
      <div className="mt-1 whitespace-pre-wrap border-l-2 border-border/60 pl-2 italic opacity-80">{text}</div>
    </details>
  );
}

export function EmptyResponse() {
  return (
    <p className="text-xs italic text-muted-foreground">
      The assistant finished without a written reply (it may have only run tools). Try asking it to summarize, or send your message again.
    </p>
  );
}

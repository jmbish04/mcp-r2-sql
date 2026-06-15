/**
 * @fileoverview Storyteller frontend API client.
 */

import { apiGet, apiSend } from "@/lib/api";

import type { DashboardSpec, QueryRef, RunBlockResponse, ThreadDetail, ThreadSummary } from "./types";

export function listThreads(): Promise<{ threads: ThreadSummary[] }> {
  return apiGet("storyteller/threads");
}

export function createThread(input: { title?: string; goalCategory?: string; goalSummary?: string }): Promise<{ thread: ThreadSummary }> {
  return apiSend("POST", "storyteller/threads", input);
}

export function getThread(id: string): Promise<ThreadDetail> {
  return apiGet(`storyteller/threads/${id}`);
}

export function runBlock(threadId: string, query: QueryRef, filters?: Record<string, unknown>): Promise<RunBlockResponse> {
  return apiSend("POST", `storyteller/threads/${threadId}/run-block`, { query, filters });
}

export function setThreadFilters(threadId: string, filters: Record<string, unknown>): Promise<unknown> {
  return apiSend("POST", `storyteller/threads/${threadId}/filters`, { filters });
}

export function getThreadFilters(threadId: string): Promise<{ filters: { filters: Record<string, unknown> } | null }> {
  return apiGet(`storyteller/threads/${threadId}/filters`);
}

/** Type guard for a persisted live spec. */
export function specOf(detail: ThreadDetail | null): DashboardSpec | null {
  return detail?.liveSpec?.spec ?? null;
}

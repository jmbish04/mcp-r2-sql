/**
 * @fileoverview Assistant panel island — assistant-ui Thread bound to the
 * ChatBroker Durable Object, sharing context with the Query Workbench.
 *
 * Transport: `useAgent` (WebSocket to /agents/chat-broker/:session) →
 * `useAgentChat` → `useAISDKRuntime` → assistant-ui primitives — the same
 * wiring as the template's AgentChat, plus the workbench bridge:
 *
 *  - When the agent's `run_query` / `nl_to_sql` tools complete, the SQL is
 *    pushed to the workbench via the `warehouse:run-sql` CustomEvent
 *    (run_query auto-runs so the full result set renders in the table).
 *  - The workbench's "Ask agent" button dispatches `warehouse:ask-agent`,
 *    which this panel forwards into the conversation.
 */

"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";

import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";

import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
} from "@assistant-ui/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";

import { MarkdownText } from "@/components/chat/MarkdownText";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { WAREHOUSE_EVENTS } from "./types";

/** Stable per-tab session id (shared with the template's /chat page). */
function sessionId(): string {
  if (typeof window === "undefined") return "session-ssr";
  const stored = window.sessionStorage.getItem("agent-chat-session");
  if (stored) return stored;
  const fresh = `session-${crypto.randomUUID()}`;
  window.sessionStorage.setItem("agent-chat-session", fresh);
  return fresh;
}

export function AssistantPanel() {
  const [session] = useState(sessionId);
  const agent = useAgent({ agent: "chat-broker", name: session });
  const chat = useAgentChat({ agent });
  const runtime = useAISDKRuntime(chat);
  type RuntimeProp = ComponentProps<typeof AssistantRuntimeProvider>["runtime"];

  /** Tool-call ids already forwarded to the workbench. */
  const forwarded = useRef(new Set<string>());

  // Bridge 1: agent tool results → workbench editor/results.
  useEffect(() => {
    for (const message of chat.messages) {
      const parts = (message as { parts?: unknown[] }).parts ?? [];
      for (const part of parts) {
        const p = part as {
          type?: string;
          state?: string;
          toolCallId?: string;
          input?: { sql?: string; question?: string };
          output?: { sql?: string | null; ok?: boolean };
        };
        if (!p.type?.startsWith("tool-") || p.state !== "output-available" || !p.toolCallId) continue;
        if (forwarded.current.has(p.toolCallId)) continue;

        const tool = p.type.slice("tool-".length);
        if (tool === "run_query" && (p.output?.sql || p.input?.sql)) {
          forwarded.current.add(p.toolCallId);
          window.dispatchEvent(
            new CustomEvent(WAREHOUSE_EVENTS.runSql, {
              detail: { sql: p.output?.sql ?? p.input?.sql, autoRun: true },
            }),
          );
        } else if (tool === "nl_to_sql" && p.output?.sql) {
          forwarded.current.add(p.toolCallId);
          window.dispatchEvent(
            new CustomEvent(WAREHOUSE_EVENTS.runSql, { detail: { sql: p.output.sql, autoRun: false } }),
          );
        }
      }
    }
  }, [chat.messages]);

  // Bridge 2: workbench "Ask agent" → conversation.
  useEffect(() => {
    const onAsk = (e: Event) => {
      const detail = (e as CustomEvent<{ text?: string }>).detail;
      if (detail?.text) void chat.sendMessage({ text: detail.text });
    };
    window.addEventListener(WAREHOUSE_EVENTS.askAgent, onAsk);
    return () => window.removeEventListener(WAREHOUSE_EVENTS.askAgent, onAsk);
  }, [chat]);

  const status = agent.readyState === 1 ? "connected" : agent.readyState === 0 ? "connecting" : "disconnected";

  return (
    <Card className="flex h-[calc(100vh-14rem)] min-h-[28rem] flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Analytics agent</CardTitle>
        <Badge variant={status === "connected" ? "default" : "outline"}>{status}</Badge>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 p-0">
        <AssistantRuntimeProvider runtime={runtime as unknown as RuntimeProp}>
          <ThreadPrimitive.Root className="flex h-full flex-col">
            <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-4 py-3">
              <ThreadPrimitive.Empty>
                <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-muted-foreground">
                  <p className="text-sm">Ask about the warehouse — the agent can draft, run, and interpret queries.</p>
                  <p className="text-xs">e.g. “vet contractor license 123456” or “permits filed on Mission St this year”</p>
                </div>
              </ThreadPrimitive.Empty>
              <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
            </ThreadPrimitive.Viewport>
            <ComposerPrimitive.Root className="flex items-end gap-2 px-4 py-3">
              <ComposerPrimitive.Input
                rows={1}
                placeholder="Ask the analytics agent…"
                className="flex-1 resize-none rounded-md bg-muted/40 px-3 py-2 text-sm ring-1 ring-foreground/10 placeholder:text-muted-foreground focus:outline-none focus:ring-foreground/30"
              />
              <ComposerPrimitive.Send asChild>
                <Button size="sm">Send</Button>
              </ComposerPrimitive.Send>
            </ComposerPrimitive.Root>
          </ThreadPrimitive.Root>
        </AssistantRuntimeProvider>
      </CardContent>
    </Card>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="mb-3 flex justify-end">
      <div className="max-w-[85%] rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="mb-3 flex justify-start">
      <div className="max-w-[85%] rounded-md bg-muted/60 px-3 py-2 text-sm">
        <MessagePrimitive.Parts components={{ Text: MarkdownText }} />
      </div>
    </MessagePrimitive.Root>
  );
}

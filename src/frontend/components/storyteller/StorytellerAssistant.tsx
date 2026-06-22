/**
 * @fileoverview StorytellerAssistant — the bottom-right assistant-ui modal that
 * drives the whole experience. It binds to the StorytellerAgent Durable Object
 * by thread id (one DO instance per goal thread), so the agent's interview,
 * plan, and dashboard edits are all scoped to the active goal.
 *
 * Transport mirrors the workbench AssistantPanel: `useAgent` (WebSocket to
 * /agents/storyteller-agent/:threadId) → `useAgentChat` → `useAISDKRuntime` →
 * assistant-ui primitives.
 *
 * Bridge: whenever a dashboard-mutating tool completes (save_data_plan,
 * propose_dashboard, approve_dashboard, update_dashboard_block, set_filters),
 * the panel dispatches a `storyteller:refresh` CustomEvent so StorytellerApp
 * reloads the live spec / filters and re-renders.
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

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarkdownText } from "@/components/chat/MarkdownText";
import { ChatErrorNotice, TypingIndicator } from "@/components/chat/ChatErrorNotice";
import { EmptyResponse, ReasoningPart, ToolFallback } from "@/components/chat/message-parts";

import { STORYTELLER_EVENTS, REFRESHING_TOOLS } from "./events";

export function StorytellerAssistant({ threadId }: { threadId: string }) {
  const [open, setOpen] = useState(true);
  const agent = useAgent({ agent: "storyteller-agent", name: threadId });
  const chat = useAgentChat({ agent });
  const runtime = useAISDKRuntime(chat);
  type RuntimeProp = ComponentProps<typeof AssistantRuntimeProvider>["runtime"];

  /** Tool-call ids already acted on (so we dispatch refresh once each). */
  const handled = useRef(new Set<string>());

  // Reset handled set when switching threads (new DO instance / message list).
  useEffect(() => {
    handled.current = new Set();
  }, [threadId]);

  // Bridge: dashboard-mutating tool results → refresh the dashboard.
  useEffect(() => {
    let shouldRefresh = false;
    for (const message of chat.messages) {
      const parts = (message as { parts?: unknown[] }).parts ?? [];
      for (const part of parts) {
        const p = part as { type?: string; state?: string; toolCallId?: string };
        if (!p.type?.startsWith("tool-") || p.state !== "output-available" || !p.toolCallId) continue;
        if (handled.current.has(p.toolCallId)) continue;
        const tool = p.type.slice("tool-".length);
        handled.current.add(p.toolCallId);
        if (REFRESHING_TOOLS.has(tool)) shouldRefresh = true;
      }
    }
    if (shouldRefresh) {
      window.dispatchEvent(new CustomEvent(STORYTELLER_EVENTS.refresh, { detail: { threadId } }));
    }
  }, [chat.messages, threadId]);

  const status = agent.readyState === 1 ? "connected" : agent.readyState === 0 ? "connecting" : "disconnected";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-1 ring-foreground/10 transition hover:scale-105"
        aria-label="Open the storyteller assistant"
      >
        <span className="text-xl">💬</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex h-[32rem] w-[24rem] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Storyteller</span>
          <Badge variant={status === "connected" ? "default" : "outline"} className="text-[10px]">{status}</Badge>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Minimize" className="text-muted-foreground hover:text-foreground">✕</button>
      </div>
      <div className="min-h-0 flex-1">
        <AssistantRuntimeProvider runtime={runtime as unknown as RuntimeProp}>
          <ThreadPrimitive.Root className="flex h-full flex-col">
            <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-3 py-3">
              <ThreadPrimitive.Empty>
                <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center text-muted-foreground">
                  <p className="text-sm">Tell me your goal as a San Francisco homeowner.</p>
                  <p className="text-xs">e.g. “I’m planning an ADU in the Portola — is my contractor legit, and how long will permitting take?”</p>
                </div>
              </ThreadPrimitive.Empty>
              <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
              {chat.status === "submitted" || (chat.isStreaming && !chat.error) ? <TypingIndicator /> : null}
              {chat.error ? (
                <ChatErrorNotice
                  error={chat.error}
                  surface="storyteller-agent"
                  context={{ thread: threadId, model: "getChatModel (Workers AI)" }}
                  onRetry={() => void chat.regenerate()}
                />
              ) : null}
            </ThreadPrimitive.Viewport>
            <ComposerPrimitive.Root className="flex items-end gap-2 border-t border-border px-3 py-3">
              <ComposerPrimitive.Input
                rows={1}
                placeholder="Message the storyteller…"
                className="flex-1 resize-none rounded-md bg-muted/40 px-3 py-2 text-sm ring-1 ring-foreground/10 placeholder:text-muted-foreground focus:outline-none focus:ring-foreground/30"
              />
              <ComposerPrimitive.Send asChild>
                <Button size="sm">Send</Button>
              </ComposerPrimitive.Send>
            </ComposerPrimitive.Root>
          </ThreadPrimitive.Root>
        </AssistantRuntimeProvider>
      </div>
    </div>
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
        <MessagePrimitive.Parts
          components={{ Text: MarkdownText, Reasoning: ReasoningPart, Empty: EmptyResponse, tools: { Fallback: ToolFallback } }}
        />
      </div>
    </MessagePrimitive.Root>
  );
}

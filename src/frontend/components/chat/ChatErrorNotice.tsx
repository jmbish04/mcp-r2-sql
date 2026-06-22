/**
 * @fileoverview ChatErrorNotice — the error surface for assistant-ui chats.
 *
 * When an agent turn fails, the bubble would otherwise be empty. This renders
 * the real error message with three actions:
 *   - Copy error        → raw message to clipboard
 *   - Copy as prompt     → the error wrapped as a ready-to-paste prompt for a
 *                          coding agent (includes stack + runtime context)
 *   - Retry              → re-run the last turn (optional)
 */

"use client";

import { useState } from "react";
import { AlertTriangleIcon, CheckIcon, ClipboardCopyIcon, RotateCcwIcon, WandSparklesIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Build a self-contained debugging prompt from an error + runtime context. */
export function wrapErrorAsPrompt(args: {
  error: Error | string;
  surface: string;
  context?: Record<string, string | undefined>;
}): string {
  const err = typeof args.error === "string" ? args.error : (args.error.stack ?? args.error.message);
  const ctx = Object.entries(args.context ?? {})
    .filter(([, v]) => v)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  return [
    `I'm debugging a Cloudflare Worker chat agent (assistant-ui + Cloudflare Agents SDK \`AIChatAgent\` Durable Object + Workers AI via \`streamText\`).`,
    `The surface \`${args.surface}\` returned this error:`,
    "",
    "```",
    err,
    "```",
    ctx ? `\nRuntime context:\n${ctx}` : "",
    "",
    `The error is forwarded to the client via \`streamText().toUIMessageStreamResponse({ onError })\` and logged server-side in \`onChatMessage\`'s \`onError\`. Please diagnose the root cause and propose a fix. Likely areas: tool input schemas (Zod → JSON schema) the Workers AI model rejects, too many tools, or the model id in \`getChatModel\`.`,
  ].join("\n");
}

export function ChatErrorNotice({
  error,
  surface,
  context,
  onRetry,
}: {
  error: Error | string;
  surface: string;
  context?: Record<string, string | undefined>;
  onRetry?: () => void;
}) {
  const [copied, setCopied] = useState<"err" | "prompt" | null>(null);
  const message = typeof error === "string" ? error : error.message;

  const copy = async (which: "err" | "prompt") => {
    const text = which === "err" ? message : wrapErrorAsPrompt({ error, surface, context });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  return (
    <div
      className="mb-3 flex flex-col gap-2 rounded-md p-3 text-sm ring-1"
      style={{ color: "var(--chart-4)", borderColor: "var(--chart-4)", backgroundColor: "color-mix(in oklch, var(--chart-4) 12%, transparent)" }}
    >
      <div className="flex items-start gap-2">
        <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">The assistant hit an error</span>
          <span className="break-words text-xs opacity-90">{message || "Unknown error (no message returned)."}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => void copy("err")}>
          {copied === "err" ? <CheckIcon className="size-3.5" /> : <ClipboardCopyIcon className="size-3.5" />}
          {copied === "err" ? "Copied" : "Copy error"}
        </Button>
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => void copy("prompt")}>
          {copied === "prompt" ? <CheckIcon className="size-3.5" /> : <WandSparklesIcon className="size-3.5" />}
          {copied === "prompt" ? "Copied" : "Copy as prompt"}
        </Button>
        {onRetry ? (
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={onRetry}>
            <RotateCcwIcon className="size-3.5" />
            Retry
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Three-dot "assistant is thinking" indicator. */
export function TypingIndicator({ label = "Thinking" }: { label?: string }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
      <span className="flex gap-1">
        <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-current" />
      </span>
      {label}…
    </div>
  );
}

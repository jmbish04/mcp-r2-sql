/**
 * @fileoverview MarkdownText — the assistant-ui `Text` part renderer that turns
 * model markdown into real formatted HTML (so `**bold**` renders as bold, lists
 * as lists, etc.) instead of showing raw markdown in the chat bubble.
 *
 * Built on `MarkdownTextPrimitive` from @assistant-ui/react-markdown with
 * GitHub-flavored markdown (tables, strikethrough, task lists) and dark-theme
 * prose styling. Pass it to any chat thread via:
 *   <MessagePrimitive.Parts components={{ Text: MarkdownText }} />
 */

"use client";

import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

export function MarkdownText() {
  return (
    <MarkdownTextPrimitive
      remarkPlugins={[remarkGfm]}
      className={cn(
        // Tailwind Typography, tuned for compact dark chat bubbles.
        "prose prose-sm prose-invert max-w-none break-words",
        "prose-p:my-1.5 prose-p:leading-relaxed",
        "prose-headings:mb-1.5 prose-headings:mt-3 prose-headings:font-semibold first:prose-headings:mt-0",
        "prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5",
        "prose-pre:my-2 prose-pre:rounded-md prose-pre:bg-muted/60 prose-pre:p-3 prose-pre:text-xs",
        "prose-code:rounded prose-code:bg-muted/60 prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:before:content-none prose-code:after:content-none",
        "prose-a:text-[var(--chart-2)] prose-a:underline prose-a:underline-offset-2",
        "prose-strong:text-foreground prose-strong:font-semibold",
        "prose-table:my-2 prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1",
        "prose-hr:my-3 prose-blockquote:my-2 prose-blockquote:border-l-2 prose-blockquote:pl-3",
      )}
      components={{
        a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
      }}
    />
  );
}

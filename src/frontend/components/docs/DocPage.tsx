/**
 * @fileoverview DocPage — renders one documentation page: the title, a
 * copy-to-clipboard button (green check on success, no alerts), the
 * Pacific-time "last updated" stamp, and the markdown body (GitHub-flavored,
 * with ```mermaid fences rendered as diagrams).
 *
 * Rendered as a client-only island so mermaid + clipboard work without SSR
 * concerns; the sidebar + layout are SSR for crawlable navigation.
 */

"use client";

import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CheckIcon, ClipboardIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { Mermaid } from "./Mermaid";

/** Format an ISO timestamp to Pacific time, 12-hour, e.g. "Jun 19, 2026, 10:00 AM PDT". */
function formatPacific(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true,
      timeZoneName: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Pull the raw text out of a markdown <pre>'s <code> child. */
function codeText(children: ReactNode): string {
  const child = Array.isArray(children) ? children[0] : children;
  const raw = (child as { props?: { children?: unknown } } | undefined)?.props?.children;
  return Array.isArray(raw) ? raw.join("") : String(raw ?? "");
}
function codeClass(children: ReactNode): string {
  const child = Array.isArray(children) ? children[0] : children;
  return (child as { props?: { className?: string } } | undefined)?.props?.className ?? "";
}

export function DocPage({ title, lastUpdated, content }: { title: string; lastUpdated: string; content: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — no alert, button simply doesn't flip */
    }
  };

  return (
    <article className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="flex flex-col gap-3 border-b border-border/40 pb-4">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void copy()}
            className={cn("gap-1.5", copied && "text-[var(--chart-2)]")}
          >
            {copied ? <CheckIcon className="size-4 text-[var(--chart-2)]" /> : <ClipboardIcon className="size-4" />}
            {copied ? "Copied" : "Copy page"}
          </Button>
          <span className="text-xs text-muted-foreground">Last updated {formatPacific(lastUpdated)}</span>
        </div>
      </header>

      <div
        className={cn(
          "prose prose-invert mt-6 max-w-none break-words",
          "prose-headings:scroll-mt-20 prose-headings:font-semibold",
          "prose-a:text-[var(--chart-2)] prose-a:underline prose-a:underline-offset-2",
          "prose-code:rounded prose-code:bg-muted/60 prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:before:content-none prose-code:after:content-none",
          "prose-pre:bg-muted/60 prose-pre:text-xs",
          "prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1",
          "prose-strong:text-foreground",
        )}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Mermaid fences → diagrams; all other code blocks stay as <pre>.
            pre: ({ children }) =>
              /language-mermaid/.test(codeClass(children))
                ? <Mermaid chart={codeText(children).replace(/\n$/, "")} />
                : <pre>{children}</pre>,
            a: ({ node: _n, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </article>
  );
}

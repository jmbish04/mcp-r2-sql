/**
 * @fileoverview Color-coded permit badges — a consistent visual language for
 * permit status and permit type across the viewer, tables, and dialogs.
 *
 * Status is mapped to semantic hues (issued/complete → green, filed/in-review →
 * blue, hold/suspend → amber, cancelled/withdrawn/expired → red). Permit type
 * gets a deterministic hue from the Monolith chart palette so the same type is
 * always the same color.
 */

"use client";

import { Badge } from "@/components/ui/badge";

/** Map a status string to a chart-palette color token. */
function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (/(complete|issued|approved|final|closed|granted|active)/.test(s)) return "var(--chart-5)"; // green
  if (/(file|review|pending|reinstat|submitted|intake|processing)/.test(s)) return "var(--chart-1)"; // blue
  if (/(hold|suspend|stall|incomplete|revision)/.test(s)) return "var(--chart-3)"; // amber
  if (/(cancel|withdraw|expire|revoke|disappro|denied|abandon)/.test(s)) return "var(--chart-4)"; // red
  return "var(--muted-foreground)";
}

/** A color-coded status badge. */
export function StatusBadge({ status }: { status: unknown }) {
  const value = String(status ?? "").trim();
  if (!value) return <span className="text-muted-foreground">—</span>;
  const color = statusColor(value);
  return (
    <Badge
      variant="outline"
      style={{
        color,
        borderColor: `color-mix(in oklch, ${color} 45%, transparent)`,
        backgroundColor: `color-mix(in oklch, ${color} 14%, transparent)`,
      }}
    >
      {value}
    </Badge>
  );
}

const TYPE_PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

/** Stable hash → palette index so a given permit type is always one color. */
function typeColor(type: string): string {
  let h = 0;
  for (let i = 0; i < type.length; i++) h = (h * 31 + type.charCodeAt(i)) >>> 0;
  return TYPE_PALETTE[h % TYPE_PALETTE.length];
}

/** A color-coded permit-type badge. */
export function PermitTypeBadge({ type }: { type: unknown }) {
  const value = String(type ?? "").trim();
  if (!value) return <span className="text-muted-foreground">—</span>;
  const color = typeColor(value);
  return (
    <Badge
      variant="outline"
      style={{
        color,
        borderColor: `color-mix(in oklch, ${color} 45%, transparent)`,
        backgroundColor: `color-mix(in oklch, ${color} 14%, transparent)`,
      }}
    >
      {value}
    </Badge>
  );
}

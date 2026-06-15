/**
 * @fileoverview Centralized DBI badge colors — the ONLY source for permit
 * trade-category / status / neighborhood badge styling, so a value looks
 * identical everywhere (e.g. `building` = black/white, `Portola` = purple).
 *
 * Colors are data-driven from config_options (groups permit_trade_category,
 * permit_status, sf_neighborhood); `useDbiBadges()` loads them once and merges
 * over built-in defaults. A deterministic fallback colors any unseeded value.
 */

"use client";

import { useEffect, useState } from "react";

import { getConfigOptions } from "./config-options";

export interface BadgeStyle {
  backgroundColor: string;
  color: string;
}

/** config_options group ↔ the field it styles. */
export type BadgeGroup = "permit_trade_category" | "permit_status" | "sf_neighborhood";

/** Built-in defaults (mirror the seed) so badges render before config loads. */
const DEFAULTS: Record<BadgeGroup, Record<string, BadgeStyle>> = {
  permit_trade_category: {
    building: { backgroundColor: "#0a0a0a", color: "#ffffff" },
    electrical: { backgroundColor: "#f59e0b", color: "#0a0a0a" },
    plumbing: { backgroundColor: "#0ea5e9", color: "#0a0a0a" },
  },
  permit_status: {
    complete: { backgroundColor: "#16a34a", color: "#fff" },
    issued: { backgroundColor: "#16a34a", color: "#fff" },
    filed: { backgroundColor: "#2563eb", color: "#fff" },
    cancelled: { backgroundColor: "#dc2626", color: "#fff" },
    withdrawn: { backgroundColor: "#dc2626", color: "#fff" },
  },
  sf_neighborhood: {
    Portola: { backgroundColor: "#7c3aed", color: "#fff" },
  },
};

/** Deterministic palette fallback for unseeded values (still readable). */
const FALLBACK = ["#2563eb", "#0891b2", "#7c3aed", "#16a34a", "#d97706", "#dc2626", "#0d9488", "#4f46e5", "#db2777", "#65a30d"];
function fallbackColor(value: string): BadgeStyle {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return { backgroundColor: FALLBACK[h % FALLBACK.length], color: "#ffffff" };
}

/** Round a cost to a compact USD string for the green cost badge. */
export function formatCost(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return `$${Math.round(n)}`;
}

/**
 * Hook: load the badge config groups once and return a lookup that merges
 * config over defaults, with a deterministic fallback. Synchronous to call.
 */
export function useDbiBadges() {
  const [overrides, setOverrides] = useState<Record<string, Record<string, BadgeStyle>>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const groups: BadgeGroup[] = ["permit_trade_category", "permit_status", "sf_neighborhood"];
      const next: Record<string, Record<string, BadgeStyle>> = {};
      for (const g of groups) {
        const opts = await getConfigOptions(g);
        next[g] = {};
        for (const o of opts) if (o.color) next[g][o.value] = { backgroundColor: o.color, color: o.textColor ?? "#ffffff" };
      }
      if (!cancelled) setOverrides(next);
    })();
    return () => { cancelled = true; };
  }, []);

  function badgeFor(group: BadgeGroup, value: unknown): BadgeStyle {
    const v = String(value ?? "").trim();
    if (!v) return { backgroundColor: "transparent", color: "var(--muted-foreground)" };
    return overrides[group]?.[v] ?? DEFAULTS[group]?.[v] ?? fallbackColor(v);
  }

  return { badgeFor, formatCost };
}

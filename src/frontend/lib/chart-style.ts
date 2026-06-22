/**
 * @fileoverview Shared chart style profile — the single source every chart
 * (declarative + custom) imports so the user NEVER sees black-on-black text and
 * every chart uses one graduated BLUE hue family (no rainbow).
 *
 * Critical: label/axis fill is `var(--foreground)` (NOT `hsl(var(--foreground))`
 * — `--foreground` is OKLCH and the hsl() wrapper renders black).
 */

/** High-contrast tick/label style for axes. */
export const AXIS_TICK = { fill: "var(--foreground)", fontSize: 11 } as const;

/** White value labels placed on/over bars. */
export const VALUE_LABEL = { fill: "#ffffff", fontSize: 11, fontWeight: 600 } as const;

/** Grid stroke (subtle, foreground-based). */
export const GRID_STROKE = "var(--foreground)";
export const GRID_OPACITY = 0.08;

/** Base blue. */
export const BLUE = "var(--chart-1)";

/**
 * A graduated blue ramp — all the chart-1 hue, descending lightness toward the
 * background. Use for multi-series / per-category coloring instead of a rainbow.
 */
export function blueRamp(i: number, n: number): string {
  const pct = Math.round(100 - (i / Math.max(1, n - 1)) * 60); // 100% → 40%
  return `color-mix(in oklch, var(--chart-1) ${pct}%, var(--background))`;
}

/** N graduated blue hues. */
export function blueSeries(n: number): string[] {
  return Array.from({ length: n }, (_, i) => blueRamp(i, n));
}

/** Format a number compactly ($-aware handled separately). */
export function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
}

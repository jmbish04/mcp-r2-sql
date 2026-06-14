/**
 * @fileoverview Client helpers for the data-driven config-options registry.
 *
 * Frontend code reads admin-managed options (dropdowns, badge colors) from
 * `/api/config-options` instead of hardcoded enums. A tiny in-memory cache keeps
 * repeat reads cheap within a page session.
 */

import { apiGet } from "./api";

/** One config option as served by the API. */
export interface ConfigOption {
  id: string;
  configKey: string;
  value: string;
  label: string;
  description: string | null;
  color: string | null;
  textColor: string | null;
  sortOrder: number;
  active: boolean;
  metadata: Record<string, unknown>;
}

const cache = new Map<string, ConfigOption[]>();

/**
 * Fetch options for a config group (active-only by default), cached per session.
 * @param key - config_key group, e.g. "goal_category" | "vetting_role".
 * @param opts.activeOnly - default true.
 * @param opts.force - bypass the cache.
 */
export async function getConfigOptions(
  key: string,
  opts: { activeOnly?: boolean; force?: boolean } = {},
): Promise<ConfigOption[]> {
  const activeOnly = opts.activeOnly ?? true;
  const cacheKey = `${key}:${activeOnly}`;
  if (!opts.force && cache.has(cacheKey)) return cache.get(cacheKey)!;
  try {
    const res = await apiGet<{ options: ConfigOption[] }>(
      "config-options",
      activeOnly ? { key, active: "true" } : { key },
    );
    cache.set(cacheKey, res.options);
    return res.options;
  } catch {
    return [];
  }
}

/** Clear the client cache (call after an admin mutation). */
export function clearConfigCache(): void {
  cache.clear();
}

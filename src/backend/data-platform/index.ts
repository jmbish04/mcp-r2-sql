/**
 * @fileoverview Barrel for the data-platform layer (R2 SQL + Catalog + SODA).
 * Consumers import from `@/backend/data-platform` — never from individual files.
 */

export * from "./types";
export * from "./guard";
export * from "./r2sql";
export * from "./catalog";
export * from "./soda";
export * from "./schema-info";
export * from "./log";
export * from "./vetting";

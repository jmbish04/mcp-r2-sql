/**
 * @fileoverview Structured logging into the mirrored D1 logging layer
 * (`query_logs`) for every data-platform operation.
 *
 * Writes are fire-and-forget: failures to log NEVER fail the request — they
 * fall back to a structured `console.error` line (picked up by Workers
 * observability). Pass an `ExecutionContext` to detach the write via
 * `waitUntil`; otherwise the insert is awaited.
 */

import { getDb } from "@/db";
import { queryLogs, type NewQueryLogEntry } from "@db/schemas";

/**
 * Persist one operation log row to D1.
 *
 * @param env - Worker bindings (needs DB).
 * @param entry - The log row (id/createdAt are defaulted by the schema).
 * @param ctx - Optional execution context; when given, the insert runs in
 *              `waitUntil` so it doesn't add latency to the response.
 */
/**
 * Minimal structural slice of ExecutionContext — avoids the lib-dom (Hono)
 * vs @cloudflare/workers-types `ExecutionContext` type friction.
 */
type WaitUntilCtx = { waitUntil(promise: Promise<unknown>): void };

export function logOperation(env: Env, entry: NewQueryLogEntry, ctx?: WaitUntilCtx): Promise<void> | void {
  const write = async () => {
    try {
      await getDb(env).insert(queryLogs).values(entry);
    } catch (err) {
      console.error(
        JSON.stringify({
          level: "ERROR",
          message: "query_logs insert failed",
          error: err instanceof Error ? err.message : String(err),
          entry: { source: entry.source, operation: entry.operation, ok: entry.ok },
        }),
      );
    }
  };
  if (ctx) {
    ctx.waitUntil(write());
    return;
  }
  return write();
}

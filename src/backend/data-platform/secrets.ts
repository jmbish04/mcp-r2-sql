/**
 * @fileoverview Secret resolution for the data-platform layer.
 *
 * The R2 SQL bearer token is provisioned as a Cloudflare **Secrets Store**
 * binding (`R2_SQL_TOKEN` → store secret `CLOUDFLARE_R2_SQL_TOKEN`), which
 * exposes an async `.get()` rather than a plain string. This helper resolves
 * it uniformly and also tolerates a plain-string value (local `.dev.vars`
 * fallback), mirroring the template's `utils/secrets.ts#getSecret` precedence.
 *
 * The matching S3-compatible credentials the operator also stored
 * (`CLOUDFLARE_R2_SQL_ACCESS_KEY_ID` / `CLOUDFLARE_R2_SQL_SECRET_ACCESS_KEY`)
 * are bound as `R2_SQL_ACCESS_KEY_ID` / `R2_SQL_SECRET_ACCESS_KEY` for future
 * PyIceberg/orphan-removal style operations; the R2 SQL query API and the
 * Catalog REST API both authenticate with the Bearer token alone, so only
 * {@link getR2SqlToken} is consumed today.
 */

/**
 * Resolve the R2 SQL bearer token from the Secrets Store binding (or a
 * plain-string dev fallback).
 *
 * @param env - Worker bindings.
 * @returns The token string, or `null` when it is unset/empty.
 */
export async function getR2SqlToken(env: Env): Promise<string | null> {
  const binding = (env as unknown as Record<string, unknown>).R2_SQL_TOKEN;
  if (!binding) return null;
  if (typeof binding === "string") return binding || null;
  if (typeof (binding as { get?: unknown }).get === "function") {
    const value = await (binding as { get: () => Promise<string | null> }).get();
    return value || null;
  }
  return null;
}

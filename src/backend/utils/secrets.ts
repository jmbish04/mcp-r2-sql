/**
 * @fileoverview Secret + signing-key helpers.
 *
 * Best practice (per project convention): every secret has a dedicated typed
 * getter that resolves the Secrets Store binding via `env.<BINDING>.get()`,
 * with a plain-string fallback for local `.dev.vars`. Call the specific getter
 * (e.g. {@link getCloudflareAccountId}) — NOT the generic {@link getSecret} —
 * for normal worker operations.
 *
 * All Secrets Store bindings are declared in `wrangler.jsonc`
 * (`secrets_store_secrets`) and typed in `worker-configuration.d.ts`.
 */

/**
 * Generic helper to fetch a secret value by binding name.
 *
 * Precedence:
 * 1. Secrets Store binding (async `.get()`)
 * 2. Plain env var (string) — local/dev fallback
 *
 * CAUTION: prefer the specific typed getters below for normal use. This generic
 * lookup is for dynamic/provisioning paths (e.g. retrieving a secret to mirror
 * it into a GitHub repo secret or other external system), and for graceful
 * "is it configured?" probes that must not throw.
 *
 * @param env - Worker bindings.
 * @param key - The Env binding name.
 * @returns The secret string, or `undefined` when unset.
 */
export async function getSecret(env: Env, key: string): Promise<string | undefined> {
  const envVal = (env as Record<string, any>)[key];
  if (envVal && typeof envVal?.get === "function") {
    return await envVal.get();
  }
  return envVal;
}

/** Resolve a Secrets Store binding (or string fallback) to its value. */
async function readBinding(env: Env, key: string): Promise<string | undefined> {
  const v = (env as Record<string, any>)[key];
  if (!v) return undefined;
  return typeof v === "string" ? v : await v.get();
}

// ---------------------------------------------------------------------------
// Worker / agent access keys
// ---------------------------------------------------------------------------

/** WORKER_API_KEY — the signed-session login + GitHub webhook secret. */
export async function getWorkerApiKey(env: Env): Promise<string | undefined> {
  return readBinding(env, "WORKER_API_KEY");
}

/**
 * AGENTIC_WORKER_API_KEY — agent/automation access key (supports the
 * `?AGENT_AUTH=` query-param auth path). Maps to the same WORKER_API_KEY secret.
 */
export async function getAgenticWorkerApiKey(env: Env): Promise<string | undefined> {
  return readBinding(env, "AGENTIC_WORKER_API_KEY");
}

/** GITHUB_TOKEN (store secret GH_TOKEN). */
export async function getGithubToken(env: Env): Promise<string | undefined> {
  return readBinding(env, "GITHUB_TOKEN");
}

// ---------------------------------------------------------------------------
// Cloudflare platform credentials (provisioning / API access)
// ---------------------------------------------------------------------------

/** CLOUDFLARE_WRANGLER_API_TOKEN — the Cloudflare API token (a.k.a. CLOUDFLARE_API_TOKEN). */
export async function getCloudflareApiToken(env: Env): Promise<string | undefined> {
  return readBinding(env, "CLOUDFLARE_WRANGLER_API_TOKEN");
}

/** CLOUDFLARE_ACCOUNT_ID. */
export async function getCloudflareAccountId(env: Env): Promise<string | undefined> {
  return readBinding(env, "CLOUDFLARE_ACCOUNT_ID");
}

/** CLOUDFLARE_AI_GATEWAY_TOKEN — auth for the AI Gateway `/compat` endpoint. */
export async function getCloudflareAiGatewayToken(env: Env): Promise<string> {
  const v = await readBinding(env, "CLOUDFLARE_AI_GATEWAY_TOKEN");
  if (!v) throw new Error("Missing env.CLOUDFLARE_AI_GATEWAY_TOKEN in Secret Store Bindings");
  return v;
}

/** Build the AI Gateway `/compat` base URL from the account id + AI_GATEWAY_ID var. */
export async function getCloudflareAiGatewayUrl(env: Env): Promise<string> {
  const accountId = await getCloudflareAccountId(env);
  const gatewayId = env.AI_GATEWAY_ID;
  if (!accountId || !gatewayId) {
    throw new Error("Missing CLOUDFLARE_ACCOUNT_ID or AI_GATEWAY_ID for AI Gateway integration");
  }
  return `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/compat`;
}

/** CLOUDFLARE_IMAGES_STREAM_TOKEN — Images/Stream API token. */
export async function getCloudflareImagesToken(env: Env): Promise<string> {
  const v = await readBinding(env, "CLOUDFLARE_IMAGES_STREAM_TOKEN");
  if (!v) throw new Error("Missing env.CLOUDFLARE_IMAGES_STREAM_TOKEN in Secret Store Bindings");
  return v;
}

/** CF_BROWSER_RENDER_TOKEN — Browser Rendering API token. */
export async function getCloudflareBrowserRenderToken(env: Env): Promise<string> {
  const v = await readBinding(env, "CF_BROWSER_RENDER_TOKEN");
  if (!v) throw new Error("Missing env.CF_BROWSER_RENDER_TOKEN in Secret Store Bindings");
  return v;
}

// ---------------------------------------------------------------------------
// Third-party / AI provider keys
// ---------------------------------------------------------------------------

/** JULES_API_KEY. */
export async function getJulesApiKey(env: Env): Promise<string> {
  const v = await readBinding(env, "JULES_API_KEY");
  if (!v) throw new Error("Missing env.JULES_API_KEY in Secret Store Bindings");
  return v;
}

/** GEMINI_API_KEY. */
export async function getGeminiApiKey(env: Env): Promise<string> {
  const v = await readBinding(env, "GEMINI_API_KEY");
  if (!v) throw new Error("Missing env.GEMINI_API_KEY in Secret Store Bindings");
  return v;
}

/** NOTEBOOKLM_AUTH_TOKEN. */
export async function getNotebookLMAuthToken(env: Env): Promise<string> {
  const v = await readBinding(env, "NOTEBOOKLM_AUTH_TOKEN");
  if (!v) throw new Error("Missing env.NOTEBOOKLM_AUTH_TOKEN in Secret Store Bindings");
  return v.trim();
}

// ---------------------------------------------------------------------------
// Google Maps Platform + Programmable Search
// ---------------------------------------------------------------------------

/** GOOGLE_MAPS_API — browser Maps key (Places autocomplete / Geocoding). */
export async function getGoogleMapsApiKey(env: Env): Promise<string> {
  const v = await readBinding(env, "GOOGLE_MAPS_API");
  if (!v) throw new Error("Missing env.GOOGLE_MAPS_API in Secret Store Bindings");
  return v;
}

/** GOOGLE_SEARCH_API_KEY — Programmable Search (Custom Search JSON API) key. */
export async function getGoogleSearchApiKey(env: Env): Promise<string> {
  const v = await readBinding(env, "GOOGLE_SEARCH_API_KEY");
  if (!v) throw new Error("Missing env.GOOGLE_SEARCH_API_KEY in Secret Store Bindings");
  return v;
}

/** GOOGLE_SEARCH_CSE_ID — Programmable Search engine id (cx). */
export async function getGoogleSearchCseId(env: Env): Promise<string> {
  const v = await readBinding(env, "GOOGLE_SEARCH_CSE_ID");
  if (!v) throw new Error("Missing env.GOOGLE_SEARCH_CSE_ID in Secret Store Bindings");
  return v;
}

// ---------------------------------------------------------------------------
// Google Workspace service account (Domain-Wide Delegation)
// ---------------------------------------------------------------------------

/**
 * Service-account RSA private key, reassembled from the two-part secret and
 * stripped of PEM header/footer/whitespace for Web Crypto compatibility.
 */
export async function getGoogleServiceAccountPrivateKey(env: Env): Promise<string> {
  const pt1 = await readBinding(env, "GOOGLE_CREDS_SA_PRIVATE_KEY_PT_1");
  const pt2 = await readBinding(env, "GOOGLE_CREDS_SA_PRIVATE_KEY_PT_2");
  if (!pt1 || !pt2) {
    throw new Error("Missing GOOGLE_CREDS_SA_PRIVATE_KEY_PT_1 and/or PT_2 in Secret Store Bindings");
  }
  return (pt1 + pt2)
    .replace(/-----BEGIN (RSA )?PRIVATE KEY-----/, "")
    .replace(/-----END (RSA )?PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
}

/** Service-account client email. */
export async function getGoogleServiceAccountClientEmail(env: Env): Promise<string> {
  const v = await readBinding(env, "GOOGLE_CREDS_SA_CLIENT_EMAIL");
  if (!v) throw new Error("Missing env.GOOGLE_CREDS_SA_CLIENT_EMAIL in Secret Store Bindings");
  return v;
}

// ---------------------------------------------------------------------------
// Session signing + webhooks
// ---------------------------------------------------------------------------

/**
 * HMAC key used to sign the session cookie.
 *
 * Stored in the `SESSIONS` KV namespace (not the Secrets Store) so it can be
 * rotated at runtime without a redeploy. Auto-provisions a random key on first
 * use, with a dev fallback if KV is unavailable.
 */
export async function getCookieSigningKey(env: Env): Promise<string> {
  try {
    let key = await env.SESSIONS.get("COOKIE_SIGNING_KEY");
    if (key) return key;

    key = crypto.randomUUID();
    await env.SESSIONS.put("COOKIE_SIGNING_KEY", key);
    return key;
  } catch (e) {
    console.warn("Failed to read/write COOKIE_SIGNING_KEY from KV", e);
    return "default_dev_key_fallback";
  }
}

/** GitHub webhook secret — maps to WORKER_API_KEY in this project. */
export async function getGitHubWebhookSecret(env: Env): Promise<string> {
  const secret = await getWorkerApiKey(env);
  if (!secret) throw new Error("Missing WORKER_API_KEY in Secrets Store");
  return secret;
}

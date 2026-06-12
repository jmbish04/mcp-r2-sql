/**
 * @fileoverview Worker entry (wrangler.jsonc `main`) for the
 * @astrojs/cloudflare v13 / @cloudflare/vite-plugin build flow.
 *
 * The Cloudflare Vite plugin builds this file as the Worker "ssr"
 * environment during `astro build`. Routing:
 *   - `/agents/*`         → Agents SDK router (`routeAgentRequest`) — the
 *                           ChatBroker WebSocket + DO surfaces
 *   - `/api/*` + doc URLs → the Hono REST API (zod-openapi)
 *   - everything else     → Astro SSR via `handle` from
 *                           `@astrojs/cloudflare/handler` (which also serves
 *                           static assets through the ASSETS binding)
 *
 * NOTE: This replaces the v12-era `src/_worker.ts` `start(manifest)` /
 * `createExports()` protocol, which adapter v13 no longer supports.
 * Durable Object classes must be re-exported from this module — wrangler's
 * `durable_objects.bindings` class names resolve against these exports.
 */

import { handle } from "@astrojs/cloudflare/handler";
import { routeAgentRequest } from "agents";

import { app as honoApp } from "./backend/api/index";

// Durable Object agent classes (Agents SDK)
import { CodeModeAgent } from "./backend/ai/agents/CodeModeAgent";
import { BrowserHitlAgent } from "./backend/ai/agents/BrowserHitlAgent";
import { WorkflowsAgent } from "./backend/ai/agents/WorkflowsAgent";
import { ArtifactAgent } from "./backend/ai/agents/ArtifactAgent";
import { ChatBroker } from "./backend/ai/agents/ChatBroker";
import { NotificationsAgent } from "./backend/ai/agents/NotificationsAgent";

// Re-export Durable Object classes for the Workers runtime.
export {
  CodeModeAgent,
  BrowserHitlAgent,
  WorkflowsAgent,
  ArtifactAgent,
  ChatBroker,
  NotificationsAgent,
};

/** True for paths the Hono API owns (REST + OpenAPI doc surfaces). */
function isApiPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/") ||
    pathname === "/openapi.json" ||
    pathname === "/swagger" ||
    pathname === "/scalar" ||
    pathname === "/scaler"
  );
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 1. Agents SDK WebSocket/HTTP routing: /agents/:agent-name/:instance.
    if (url.pathname.startsWith("/agents/")) {
      const agentResponse = await routeAgentRequest(request as never, env);
      if (agentResponse) return agentResponse as unknown as Response;
    }

    // 2. REST API + OpenAPI docs → Hono.
    if (isApiPath(url.pathname)) {
      return honoApp.fetch(request, env, ctx);
    }

    // 3. Everything else → Astro SSR (with static-asset fallthrough).
    return handle(request as never, env as never, ctx as never) as unknown as Promise<Response>;
  },
};

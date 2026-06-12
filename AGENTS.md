# AGENTS

- At the start of every turn, use the `cloudflare-docs` MCP server to verify Cloudflare assumptions, architecture, and deprecations before writing or changing code.
- Review and apply the best practices in `.agents/skills/` and `.github/skills/` before implementing changes.
- Build new views as React islands on top of the existing Astro + Shadcn foundation, using the dark/moody theme system and subtle contrast instead of heavy borders.
- Enforce Zod validation on backend endpoints, expose OpenAPI v3.1.0 at `/openapi.json`, `/swagger`, and `/scalar`, and keep endpoints strongly typed.
- Every new service or view must expose `/health` and emit structured logs/metrics into the mirrored D1 logging layer.
# R2 SQL Analytics App (docs/0001_init) — Build Notes & Deviations

This repo now hosts the **R2 Data Catalog SQL analytics MVP** (see
`docs/0001_init/TASKS.json` + `docs/cslb-schema.json`). Key facts for future agents:

- **Warehouse reality (Phase-0 gate)**: despite the bucket name
  (`cslb-master-licenses-sql`), there is **no CSLB master-license table**. All data
  lives in namespace `sf_dbi` (10 batch-loaded SF DBI tables, ~548k rows; columns in
  `docs/cslb-schema.json`, mirrored in `src/backend/data-platform/schema-data.ts`).
  Contractor vetting uses `sf_dbi.permit_contractors` (license1/firm_name/role).
  No Pipelines feed this bucket — ingestion is batch (PyIceberg-style).
- **Data-platform layer**: `src/backend/data-platform/` (R2 SQL client, catalog REST
  client, SODA client, SQL guard, vetting queries, D1 `query_logs` logging). Routes:
  `/api/r2/*`, `/api/permits/*`, `/api/ai/*`, `/api/vetting/*`, `/api/diagnostics`
  — all zod-openapi typed, each family exposes `/health`, all ops log to D1.
- **Chat agent**: the existing `ChatBroker` DO now carries the analytics toolkit
  (`src/backend/ai/agents/analytics/`): run_query, nl_to_sql, describe_schema,
  interpret_results, detect_anomalies, suggest_queries, lookup_permits,
  vet_contractor. Frontend: `/workbench` pairs `QueryWorkbench` + `AssistantPanel`
  islands sharing context via `warehouse:*` CustomEvents.
- **Secret**: `R2_SQL_TOKEN` (npx wrangler secret put R2_SQL_TOKEN) — scopes:
  R2 Storage Admin R&W + R2 Data Catalog R&W + R2 SQL Read. Until set, R2 SQL
  surfaces degrade gracefully with actionable errors; SODA + AI + D1 are live.
- **DEVIATION — Stitch/Jules ceremony skipped** per the build brief: React islands
  were built directly on the existing shadcn foundation (speed over mockups).
- **DEVIATION — WORKER_LOADERS unused** by the analytics agent: all tools are
  typed, pre-audited server functions behind the SQL guard; there is no untrusted
  dynamic code to sandbox.
- **CRITICAL — @astrojs/cloudflare v13 build flow** (migrated 2026-06-12): the
  adapter is now built on `@cloudflare/vite-plugin`. `wrangler.jsonc` `main` points
  at **source** (`src/worker.ts`; DO classes re-exported there), the build emits the
  deployable config at `dist/server/wrangler.json`, and deploy is
  `wrangler deploy -c dist/server/wrangler.json` (already wired into
  `pnpm run deploy`). The old `src/_worker.ts` `start()/createExports()` protocol
  and `platformProxy`/`workerEntryPoint`/`routes` adapter options are **gone** —
  do not reintroduce them. `vite.esbuild.target = "es2022"` in `astro.config.ts`
  is REQUIRED: it lowers the Agents SDK `@callable()` TC39 decorators that
  workerd's V8 cannot parse (removing it breaks build AND dev with
  "Invalid or unexpected token").

# Agent Workspace Overview

Welcome to the `core-template-cfw-assets-astro-shadcn` template. This is a unified full-stack template combining Cloudflare Workers (Backend & Assets) with Astro and React + Shadcn/ui (Frontend).

## Core Architecture

- **Backend:** Cloudflare Workers, Hono (Routing), D1 (Database with Drizzle ORM).
- **Frontend:** Astro (SSR/Static Hybrid), React (Interactive Islands), Tailwind CSS, Shadcn/ui.
- **Deployment:** Deployed using Cloudflare Workers Assets via `wrangler.jsonc`.

## Mandatory Agent Directives

This repository relies heavily on AI agents for rapid prototyping and feature generation. If you are an AI agent, you must strictly follow these directives:

1. **Read Startup Rules:** Immediately review `.agent/rules/startup.md` before writing any code. It contains critical instructions for your first steps.
2. **Clean State Execution:** The template's default UI has been deliberately wiped clean and replaced with a temporary template-routing warning. Build the user's requested frontend directly from `src/frontend/pages/index.astro` or the route structure you introduce, and keep the shared header available on every page.
3. **Environment Strictness:** We use `worker-configuration.d.ts` for Cloudflare types. Never manually define `interface Bindings`. Always use `Bindings: Env` on Hono applications.
4. **Runtime Baseline:** Use Node.js 22+ when working with Wrangler or regenerating `worker-configuration.d.ts`.
5. **Package Management:** Default to `pnpm` for package installation and script execution.
6. **Authentication Rule:** Use the Secrets Store binding `WORKER_API_KEY` for protected API authentication and session creation. Do not add a `users` table back into this template.
7. **Schema Layout:** Keep Drizzle tables under `db/schemas/${useCase}/${tableName}.ts` and use Drizzle-Zod for API typing where table schemas are involved.
8. **Modularization:** Keep new code modular. Split helpers, components, routes, and persistence code by concern instead of adding large multipurpose files.
9. **Template Replacement Prompt:** If the user gives you the landing-page replacement prompt, replace the starter frontend, preserve the shared header, and keep the dynamic docs pointers to `/openapi.json`, `/swagger`, and `/scaler`.
10. **Frontend Errors:** Never use Chrome/browser alerts. Route every frontend error through the centralized frontend error handling utility and keep the copy-to-clipboard success/error feedback within shadcn components.
11. **Dependency Hygiene:** Follow `.agent/rules/dependency-maintenance.md` whenever dependencies, Wrangler, or generated Cloudflare types may be stale.
12. **Architecture Rules:** Follow `.agent/rules/architecture.md` and `.agent/rules/frontend-error-handling.md` for auth, modularization, and frontend error UX conventions.
13. **CI Ownership:** If GitHub Actions or Cloudflare PR deployment checks fail because of frozen lockfiles, outdated dependencies, or stale Wrangler types, fix them in the same turn by refreshing pnpm dependencies and re-running validation before handing work back.
14. **Import Path Aliases:** ALWAYS use tsconfig path aliases (`@/backend/*`, `@/backend/db/*`, `@/backend/ai/*`, etc.) for all backend imports. Never use relative imports (`../../foo`). Run `node scripts/migrate-imports.mjs` to convert existing relative imports. See `.agent/rules/import-paths.md` for details.
15. **Comprehensive Documentation:** Every backend TypeScript file must have a file-level JSDoc comment explaining its purpose, key features, and usage. Every exported function/class must have JSDoc with `@param`, `@returns`, `@throws`, and `@example` tags where applicable. See `.agent/rules/docstrings.md` for standards.
16. **Agent Meta-Maintenance:** Update `AGENTS.md` and `.agent/rules` files when you add/modify features that future agents should know about. Keep rules concise (<12,000 chars per file), avoid duplication, and resolve conflicts. See `.agent/rules/meta-maintenance.md` for guidelines.

## Template App Surface (reference implementation)

This template ships a real, running app so new projects inherit working patterns
(extend or delete the pieces you don't need). All of it is wired to D1 via Hono;
no mock data.

- **Pages** (Astro SSR + React islands, Monolith dark theme):
  - `/dashboard` — admin dashboard: KPI stat cards, a Workers-AI insights panel,
    and the full recharts suite (area / donut / bar / horizontal-bar / throughput)
    with search + range + status filters. Components under `components/dashboard/`.
  - `/projects`, `/tasks/board` (kanban), `/tasks` (filterable table), `/tasks/[id]`
    (detail + progress), `/notes`, `/analytics`. Components under `components/tasks/`.
  - `/settings/{preferences,notifications,webhooks,activity,advanced}` (shared
    sub-nav) and `/notifications` (realtime). Components under `components/settings/`.
- **Schemas** live in `db/schemas/{projects,tasks,stats,settings,notifications}/`
  (drizzle-zod + `*_TABLE_DESCRIPTION`/`*_COLUMN_DESCRIPTIONS` for `/docs`).
- **APIs**: `/api/{projects,tasks,team-notes,settings,webhooks,activity,
  notifications,dashboard}` — CRUD + `?q=` search + filters + pagination. The
  dashboard exposes `/stats`, `/charts`, `/insights` (Workers AI via
  `ai/providers/ai-sdk.ts#getChatModel`).
- **Realtime**: the `NotificationsAgent` Durable Object (`NOTIFICATIONS_AGENT`,
  instance `"global"`) syncs notification state over WebSocket. The client island
  is `components/NotificationsFeed.tsx` (`useAgent` + `onStateUpdate`); REST
  mutations proxy to it via `getAgentByName` (never `stub.fetch`).
- **Shared frontend helpers**: `lib/api.ts` (`apiGet`/`apiSend`/`ApiError`) and
  `lib/format.ts` (`relativeTime`/`shortDate`/`compactNumber`). Charts use the
  shadcn `ui/chart.tsx` wrapper + the OKLCH `--chart-1..5` palette in `global.css`.
- **Seed demo data**: `POST /api/seed` (idempotent). Locally:
  `pnpm run migrate:local` then `curl -X POST http://localhost:8787/api/seed`.
- **SSR note**: `src/_worker.ts` exports `start(manifest)` + `createExports()`;
  page requests are rendered via `@astrojs/cloudflare/handler#handle`. Do NOT
  revert this to a bare `env.ASSETS.fetch()` fallback — that 404s every SSR page.
- **Auth**: signed session cookie only (no `users`/`sessions` table). Auth gates
  `/api/admin/*`; the feature APIs are intentionally open so the template runs
  out of the box. Tighten before production.

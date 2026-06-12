# Claude Code Prompt — R2 Data Catalog SQL Analytics Worker (quick-and-dirty MVP)

> Paste everything below into Claude Code, running inside a fresh repo generated from
> `jmbish04/core-template-cfw-assets-astro-shadcn` (use GitHub's **Use this template** flow first).

---

## Mission

Build a **working, fully-connected** analytics app on top of this template that:

1. Connects to my **R2 Data Catalog / R2 SQL** warehouse and can run **any read query** against it.
2. **Self-troubleshoots** the data pipeline/catalog so I can see at a glance whether data is flowing and queryable.
3. Uses **Workers AI** (via the existing `AI` binding + AI Gateway) for: natural-language→SQL, AI interpretation of result sets, anomaly detection, and "suggested next queries."
4. Reuses the **existing assistant-ui + Agents SDK** wiring so the chat panel talks to an agent that can answer questions about a query, draft queries, and interpret results — backed by the existing **dynamic Worker (`WORKER_LOADERS`)** pattern.
5. Adds dashboards on the **existing Astro + shadcn + recharts** frontend.
6. Adds a **Vetting tool**: pick a tool → shadcn `Dialog` modal with the right inputs → returns a result. Contractor/architect/engineer vetting queries the CSLB R2 SQL table; address/permit lookups hit the SF open-data (SODA) permits API.

This is an **MVP — quick and dirty but real**. No mock data, no stubbed responses, everything actually wired. Skip the full Stitch→Jules mockup ceremony from the jedi skill (we have a UI foundation and want speed); build React islands directly on the existing shadcn setup. Note that deviation in `AGENTS.md`.

---

## Required reading BEFORE writing any code (in order)

1. `.agent/rules/startup.md` — template's mandatory first read.
2. `AGENTS.md` — template directives (OpenAPI at `/openapi.json|/swagger|/scalar`, `/health` + structured logs into the mirrored D1 logging layer on every service/view, `Bindings: Env`, Secrets Store `WORKER_API_KEY` for auth, frontend entry `src/frontend/pages/index.astro`).
3. The **`cloudflare-jedi`** skill — stack conventions, modular folder structure (`backend/ai/providers`, `backend/ai/agents/${name}/`, schema folders with `index.ts`), UX rules (dark theme, no `window.alert/confirm`, sort+filter on tables, route errors through `ErrorLogger`).
4. The **`cloudflare-data-platform-skill`** — especially §8 (R2 SQL), §9 (SQL reference + what does NOT work), §11 (Worker patterns), §13 (observability), and §16 (Critical Gotchas). **The R2 SQL guardrails below come from §16 — honor them exactly.**
5. Per `AGENTS.md`, use the **`cloudflare-docs` MCP** to verify any Cloudflare assumption/deprecation before changing config.

Do **not** hand-edit `worker-configuration.d.ts`; run `pnpm cf-typegen` (`wrangler types`) after every binding change. Deploy only via `pnpm run deploy`. Lint/format with `pnpm lint` / `pnpm fmt` (oxlint/oxfmt — not eslint/prettier).

---

## Known facts — wire these in, don't ask me

| Thing | Value |
|---|---|
| Account ID | `b3304b14848de15c72c24a14b0cd187d` |
| R2 bucket | `cslb-master-licenses-sql` |
| Warehouse name | `b3304b14848de15c72c24a14b0cd187d_cslb-master-licenses-sql` *(format is `{ACCOUNT_ID}_{BUCKET}`)* |
| Catalog URI | `https://catalog.cloudflarestorage.com/b3304b14848de15c72c24a14b0cd187d/cslb-master-licenses-sql` |
| R2 SQL query endpoint | `POST https://api.sql.cloudflarestorage.com/api/v1/accounts/b3304b14848de15c72c24a14b0cd187d/r2-sql/query/cslb-master-licenses-sql` |
| Catalog REST (introspection) | `https://api.cloudflare.com/client/v4/accounts/b3304b14848de15c72c24a14b0cd187d/r2-catalog/cslb-master-licenses-sql/...` |
| SF permits dataset (SODA) | `https://data.sfgov.org/resource/i98e-djp9.json` (Building Permits; public, no auth) |
| Workers AI models (already vars) | `MODEL_CHAT` / `MODEL_EXTRACT` / `MODEL_DRAFT` = `@cf/openai/gpt-oss-120b`, via `AI_GATEWAY_ID` |

**Secrets/vars to add (Phase 0):**
- Secret: `R2_SQL_TOKEN` — Cloudflare API token with **R2 Storage (Admin Read & Write) + R2 Data Catalog (Read & Write) + R2 SQL (Read)**. (Open-beta quirk: R2 Storage Admin R&W is required even for read-only SQL.) Add via `npx wrangler secret put R2_SQL_TOKEN`. I will paste the token at the prompt — never hardcode it.
- Vars in `wrangler.jsonc` (not secret): `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_WAREHOUSE`, `R2_CATALOG_URI`, `SODA_PERMITS_URL`.

---

## Phase 0 — Secrets + live introspection (de-risk first)

Before building features, **prove the connection and discover the real schema** — we don't yet know the CSLB table's namespace/columns.

1. Add the secret + vars above; run `pnpm cf-typegen`.
2. Build a tiny throwaway script (or a temporary `/api/r2/_introspect` route) that:
   - Lists namespaces: `GET .../r2-catalog/.../namespaces?return_details=true`
   - Lists tables in each namespace: `GET .../namespaces/{ns}/tables?return_details=true`
   - For the CSLB table, runs R2 SQL `DESCRIBE {ns}.{table}` (free — no bytes scanned) and a `SELECT * FROM {ns}.{table} LIMIT 5`.
3. **Print the discovered namespace, table name, and column list.** Use these real column names everywhere downstream (NL→SQL system prompt, vetting query builders, dashboard cards). Do not guess column names.
4. Capture a baseline `SELECT COUNT(*)` and the per-query `metrics` (`files_scanned`, `bytes_scanned`) — you'll reuse these in the diagnostics endpoint.

---

## Phase 1 — Backend data layer + Hono routes

Follow the jedi modular structure. Add under `backend/` (or the template's equivalent) a `data-platform` domain.

**R2 SQL client** (`backend/data-platform/r2sql.ts`): a typed `queryR2SQL(env, sql)` that POSTs to the R2 SQL endpoint with `Authorization: Bearer ${env.R2_SQL_TOKEN}`, body `{query}`, 180s timeout. Return `{rows, schema, metrics, request_id}` from `result`. Surface errors (`success:false` → `errors[]`) cleanly.

**Catalog client** (`backend/data-platform/catalog.ts`): namespace list, table list (with `return_details=true`), table metadata. Remember nested-namespace separator is `%1F`.

**SODA client** (`backend/data-platform/soda.ts`): permit lookups by `street_number`+`street_name`, by `permit_number`, and a generic `$where`. (Heads-up: this dataset has **no contractor column** — address/permit lookups return permit history only; contractor vetting comes from CSLB.)

**Hono routes** (zod-openapi, all under `/api`, all with `/health`, all logged to the D1 logging layer):
- `POST /api/r2/query` — execute an **arbitrary read query**. **Guard it** (see guardrails below): reject anything that isn't a single `SELECT`/`WITH`/`SHOW`/`DESCRIBE`/`EXPLAIN`; auto-inject `LIMIT` if absent (default 500, cap 10000). Return rows + schema + metrics.
- `GET /api/r2/namespaces`, `GET /api/r2/tables`, `GET /api/r2/describe?table=` — schema browser.
- `POST /api/permits/lookup` — by address or permit number, proxied to SODA.
- `GET /api/diagnostics` — pipeline/catalog health (Phase 5).

---

## R2 SQL guardrails (from data-platform skill §16 — enforce in the query guard AND the NL→SQL system prompt)

- **Read-only.** Only `SELECT` / `WITH` / `SHOW` / `DESCRIBE` / `EXPLAIN`. Reject `INSERT/UPDATE/DELETE/CREATE/DROP/ALTER`.
- `FROM` must use `namespace.table` form.
- **Default `LIMIT` 500, max 10000.** Always ensure a `LIMIT` exists.
- **No `OFFSET`** → paginate with `WHERE` + `ORDER BY` cursor.
- **No window functions (`OVER`).** No `func(DISTINCT ...)` on aggregates — use `approx_distinct()`.
- `JOIN`, subqueries, `UNION/INTERSECT/EXCEPT`, `SELECT DISTINCT` **are** supported.
- On map columns use `map_keys()/map_values()/map_extract()` — `map_entries()` errors (80001).
- `EXPLAIN/SHOW/DESCRIBE` are free (0 bytes scanned) — use them for validation/preview.
- Validate generated SQL with `EXPLAIN` before running the real query when feasible.

---

## Phase 2 — Workers AI features (use `AI` binding + AI Gateway + `workers-ai-provider`)

Put each as its own provider/method per jedi modular rules. All four take the **discovered schema** as grounding context.

1. **NL→SQL** (`MODEL_DRAFT`): system prompt embeds the real table schema + the guardrails above + few-shot examples. Output **SQL only**; then validate via the query guard + `EXPLAIN` before offering to run. Show the SQL to the user before execution.
2. **Result interpretation** (`MODEL_CHAT`): given the executed SQL + returned rows (sampled/truncated) + metrics, produce a short plain-language reading of what the data shows.
3. **Anomaly detection** (`MODEL_EXTRACT` + simple stats): combine cheap numeric checks (nulls, outliers via IQR/z-score on numeric cols, sudden cardinality shifts) with an AI pass that flags and explains suspicious rows/columns. Also flag **operational** anomalies from query metrics (e.g. very high `files_scanned` → table needs compaction).
4. **Suggested next queries** (`MODEL_DRAFT`): given the current query + schema, propose 3–5 follow-up queries as ready-to-run SQL with one-line rationales. Render as clickable chips that populate the query box.

---

## Phase 3 — Agents SDK + assistant-ui (reuse what's already here)

The template already exports Agents-SDK Durable Objects (`CODE_MODE_AGENT`, `WORKFLOWS_AGENT`, `ARTIFACT_AGENT`, `CHAT_BROKER`, `NOTIFICATIONS_AGENT`) and a `WORKER_LOADERS` dynamic-Worker binding. **Do not add new agent infra unless needed.**

- Wire the assistant-ui chat panel to the existing `ChatBroker` (assistant-ui WebSocket broker) so the conversation streams.
- Give the agent **tools** that call the Phase 1/2 endpoints: `run_query`, `nl_to_sql`, `describe_schema`, `interpret_results`, `detect_anomalies`, `suggest_queries`, `lookup_permits`, `vet_contractor`. The agent should be able to: answer questions about a query, draft one or several queries, run them, and walk me through the result set.
- Use the existing `WORKER_LOADERS` dynamic-Worker pattern for any sandboxed/dynamic execution the agent needs (e.g. running a generated transform), per `.agent/rules` and the agents the template already ships.
- Keep `MODEL_*` + `AI_GATEWAY_ID` as the model config; verify model availability via `cloudflare-docs` MCP if unsure.

---

## Phase 4 — Frontend (Astro + React islands + shadcn + recharts)

Build on `src/frontend/pages/` with the shared header on every page, dark/moody theme, mobile-responsive, collapsible sidebar.

- **Dashboard page**: KPI cards (row count, last-load/freshness, bytes scanned last query), a recharts panel or two driven by real R2 SQL aggregates, and a **query workbench**: SQL editor → run → results table (with sort + filter) → "Interpret", "Find anomalies", and "Suggested next" actions wired to Phase 2. Show query metrics (files/bytes scanned, request_id).
- **Assistant panel**: assistant-ui chat island bound to `ChatBroker`, sharing context with the workbench (clicking a suggested query or asking the agent to "run this" populates/executes the workbench).
- **Vetting tool**: a launcher (cards or a dropdown) to pick a tool; selecting one opens a shadcn `Dialog` with the required inputs, calls the right backend, and renders results:
  - **Contractor / Architect / Engineer** → inputs: license # and/or name (+ optional city). Queries the **CSLB R2 SQL** table (use real columns from Phase 0). Show license status, classifications, expiration, bond/workers-comp flags if present.
  - **Home address → permits** → inputs: street number + street name (+ optional unit). Calls **SODA** permits; render permit history (type, status, dates, cost, description).
  - **Permit number → detail** → input: permit number. Calls SODA; render full record.
  - (Nice-to-have, small effort) cross-link: from an address's permit history, offer to vet any contractor name that appears against CSLB.

All data flows from real API calls — no placeholders. Route every error through the global `ErrorLogger`.

---

## Phase 5 — Troubleshooting / observability / deploy

- `GET /api/diagnostics` returns a health rollup: catalog status (`active`?), compaction state, target table exists, `COUNT(*)`, last-row freshness, and `files_scanned`/`bytes_scanned` from a probe query. If a **Pipeline** feeds this table, also list pipelines and surface `status` + `failure_reason` (skill §5/§16). Interpret known beta gotchas in the response text (e.g. "metrics lag 5–10 min", "high file count → enable compaction", "~5 min data-visibility delay").
- Every route/view emits structured logs/metrics into the mirrored D1 logging layer and exposes `/health` (per `AGENTS.md`).
- Run `pnpm lint && pnpm build`; fix type drift with `pnpm cf-typegen`. Deploy with `pnpm run deploy` (build → migrate:remote → wrangler deploy). Never `wrangler deploy` directly.

---

## Definition of done (acceptance checklist)

- [ ] `R2_SQL_TOKEN` set as a secret; account/bucket/warehouse/catalog vars in `wrangler.jsonc`; `wrangler types` clean.
- [ ] Phase 0 introspection printed the **real** CSLB namespace + table + columns, and they're used downstream.
- [ ] `POST /api/r2/query` runs arbitrary guarded read queries and returns rows + metrics; guardrails reject non-SELECT and cap LIMIT.
- [ ] NL→SQL, interpretation, anomaly detection, and suggested-next-queries all work against live data.
- [ ] assistant-ui chat is bound to `ChatBroker` and the agent can draft/run/interpret queries via tools.
- [ ] Dashboard + query workbench render real R2 SQL data with recharts + sortable/filterable table.
- [ ] Vetting tool: all three modes open a modal and return live results (CSLB via R2 SQL, permits via SODA).
- [ ] `/api/diagnostics` + `/health` report catalog/pipeline health; logs land in the D1 logging layer.
- [ ] OpenAPI at `/openapi.json`, `/scalar`, `/swagger`; deployed via `pnpm run deploy`.
- [ ] `AGENTS.md` updated to note the Stitch/Jules deviation and the new data-platform domain.

## Scope discipline (quick and dirty)

Auth = the existing `WORKER_API_KEY` Secrets Store binding; don't add a users table. Don't build multi-tenant, billing, or write-back/ETL. If you hit a genuine fork (e.g. CSLB columns don't support a feature), make the smallest reasonable choice, implement it, and note it — don't stop to ask unless it's a large-effort branch.

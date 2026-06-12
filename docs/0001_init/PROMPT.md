# PROMPT.md — R2 Data Catalog SQL Analytics Worker

**You are building a working MVP on top of a repo generated from `jmbish04/core-template-cfw-assets-astro-shadcn`.**
Your work breakdown lives in **`TASKS.json`** — work through it in dependency order, flip each task's `status` (`todo → in_progress → done`, or `blocked` with a reason) as you go, and treat each task's `acceptance` array as the bar for "done."

---

## Mission

Stand up an analytics app that:

1. Connects to my **R2 Data Catalog / R2 SQL** warehouse and runs **any read query**.
2. **Self-troubleshoots** the catalog/pipeline so I can see whether data is flowing and queryable.
3. Uses **Workers AI** (existing `AI` binding + AI Gateway) for **NL→SQL**, **result interpretation**, **anomaly detection**, and **suggested next queries**.
4. Reuses the **existing assistant-ui + Agents SDK** wiring so the chat panel talks to an agent that can draft/run/interpret queries, backed by the existing **dynamic Worker (`WORKER_LOADERS`)** pattern.
5. Adds **dashboards** on the existing Astro + shadcn + recharts frontend.
6. Adds a **Vetting tool**: pick a tool → shadcn `Dialog` with the right inputs → live result. Contractor/architect/engineer vetting → CSLB R2 SQL table; address/permit lookups → SF SODA permits API.

**Quick and dirty but real.** No mock data, no stubbed responses — everything actually wired. Skip the full Stitch→Jules mockup ceremony from `cloudflare-jedi` (we have a UI foundation and want speed); build React islands directly on the existing shadcn setup, and note that deviation in `AGENTS.md`.

---

## Read before writing any code (in order)

1. `.agent/rules/startup.md` — template's mandatory first read.
2. `AGENTS.md` — template directives.
3. **`cloudflare-jedi`** skill — stack + modular folder conventions + UX rules.
4. **`cloudflare-data-platform-skill`** — §8 (R2 SQL), §9 (SQL reference / what does NOT work), §11 (Worker patterns), §13 (observability), §16 (Critical Gotchas).
5. Use the **`cloudflare-docs` MCP** to verify any Cloudflare assumption/deprecation before changing config (per `AGENTS.md`).

---

## Hard rules

- Never hand-edit `worker-configuration.d.ts`; run `pnpm cf-typegen` (`wrangler types`) after every binding change.
- Use `Bindings: Env` on Hono apps; never define `interface Bindings`.
- All `/api/*` routes are zod-openapi typed; OpenAPI served at `/openapi.json`, `/scalar`, `/swagger`.
- Every service/view exposes `/health` and emits structured logs/metrics into the **mirrored D1 logging layer**.
- Frontend lives in `src/frontend/pages/`; shared header on every page; dark/moody theme; mobile-responsive; sort+filter on every table; route all errors through the global `ErrorLogger`. No `window.alert/confirm/prompt` — use shadcn `Dialog`/`AlertDialog`.
- Auth = the existing **`WORKER_API_KEY`** Secrets Store binding. Do **not** add a users table.
- Lint/format with `pnpm lint` / `pnpm fmt` (**oxlint/oxfmt**, not eslint/prettier).
- Deploy **only** via `pnpm run deploy` (build → migrate:remote → wrangler deploy). Never `wrangler deploy` directly.
- **No mock data anywhere.** If a column/feature isn't supported by the real schema, make the smallest reasonable choice, implement it, and note it.

---

## Known facts (wire these in — don't ask)

| Thing | Value |
|---|---|
| Account ID | `b3304b14848de15c72c24a14b0cd187d` |
| R2 bucket | `cslb-master-licenses-sql` |
| Warehouse | `b3304b14848de15c72c24a14b0cd187d_cslb-master-licenses-sql` (format `{ACCOUNT_ID}_{BUCKET}`) |
| Catalog URI | `https://catalog.cloudflarestorage.com/b3304b14848de15c72c24a14b0cd187d/cslb-master-licenses-sql` |
| R2 SQL endpoint | `POST https://api.sql.cloudflarestorage.com/api/v1/accounts/b3304b14848de15c72c24a14b0cd187d/r2-sql/query/cslb-master-licenses-sql` |
| Catalog REST (introspection) | `https://api.cloudflare.com/client/v4/accounts/b3304b14848de15c72c24a14b0cd187d/r2-catalog/cslb-master-licenses-sql/...` |
| SF permits (SODA) | `https://data.sfgov.org/resource/i98e-djp9.json` (Building Permits; public) |
| Workers AI models (vars) | `MODEL_CHAT` / `MODEL_EXTRACT` / `MODEL_DRAFT` = `@cf/openai/gpt-oss-120b`, via `AI_GATEWAY_ID` |

**Secrets/vars:** add secret `R2_SQL_TOKEN` (`npx wrangler secret put R2_SQL_TOKEN`) — scoped to **R2 Storage (Admin Read & Write) + R2 Data Catalog (Read & Write) + R2 SQL (Read)** (open-beta quirk: Admin R&W on Storage is required even for read-only SQL). Add non-secret vars `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_WAREHOUSE`, `R2_CATALOG_URI`, `SODA_PERMITS_URL` to `wrangler.jsonc`. I'll paste the token at the prompt; never hardcode it.

---

## Reuse what the template already ships (don't reinvent)

Durable-Object agents (`CODE_MODE_AGENT`, `WORKFLOWS_AGENT`, `ARTIFACT_AGENT`, `CHAT_BROKER`, `NOTIFICATIONS_AGENT`), the `WORKER_LOADERS` dynamic-Worker binding, the `AI` binding + AI Gateway + `MODEL_*` vars, `@assistant-ui/react(-ai-sdk)`, Hono + zod-openapi docs, D1 + Drizzle + the logging layer, and recharts. Bind the chat UI to the existing `ChatBroker`; use `WORKER_LOADERS` for any dynamic/sandboxed execution the agent needs.

---

## R2 SQL guardrails (enforce in the query guard AND the NL→SQL system prompt)

- Read-only: only `SELECT` / `WITH` / `SHOW` / `DESCRIBE` / `EXPLAIN`. Reject DML/DDL.
- `FROM` uses `namespace.table`. Always ensure a `LIMIT` (default 500, max 10000).
- No `OFFSET` (cursor-paginate with `WHERE` + `ORDER BY`). No window functions (`OVER`). No `func(DISTINCT …)` — use `approx_distinct()`.
- `JOIN`, subqueries, `UNION/INTERSECT/EXCEPT`, `SELECT DISTINCT` are supported.
- Map columns: use `map_keys/map_values/map_extract` (not `map_entries`).
- `EXPLAIN/SHOW/DESCRIBE` are free — use them to validate before running real queries.

---

## Working agreement

- **Phase 0 is a gate**: discover and print the real CSLB namespace/table/columns before building NL→SQL or vetting. Persist the discovered schema to `docs/cslb-schema.json` and use those exact column names everywhere.
- Commit per task with a message referencing the `TASKS.json` id (e.g. `feat(P1-5): /api/r2/query route`).
- Keep `pnpm lint && pnpm build` green; fix type drift with `pnpm cf-typegen`.
- Only stop to ask me on a genuine **large-effort** fork; otherwise decide, implement, and note it.

Before you write code: confirm whether the CSLB table is **Pipeline-fed** or **batch-loaded** (PyIceberg/PySpark) by inspecting it in Phase 0 — the diagnostics task branches on this.

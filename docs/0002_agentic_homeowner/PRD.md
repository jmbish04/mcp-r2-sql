# PRD — Agentic SF-Homeowner DBI Storyteller

**Status:** Plan (awaiting one architecture confirmation — see §2).
**Companions:** [RESEARCH.md](RESEARCH.md) (grounding + live data validation), [agentic_sf_context.seed.json](agentic_sf_context.seed.json) (62-row context seed), [TASKS.json](TASKS.json), [PROMPT.md](PROMPT.md).

## 1. Goal & motivation

Replace the current "hello-world" charts with an **agentic, thread-based, bespoke data-as-a-tool**
experience for San Francisco homeowners over the SF DBI warehouse. An AI agent (assistant-ui, in a
persistent bottom-right modal) **interviews the homeowner to establish their goal**, records an
evolving plan, and — on approval — renders a **custom dashboard of meaningful, interactive charts +
narrative + red-flag callouts** tailored to that goal. Each goal lives in its own **thread**; the
user toggles between threads to switch the whole experience. Follow-up chat edits the dashboard.

The agent is razor-focused because it is pre-loaded with **expert domain context** (regulatory
navigation, permit process, cost benchmarks, contractor vetting, **DBI corruption red-flags**,
inspector culture, timelines, neighborhood context, data signals, homeowner actions) — surfacing
*actionable insight + oversight*, not trivial data cuts.

## 2. Architecture decision to CONFIRM (gates the build)

**Per-thread bespoke UI = declarative `DashboardSpec` (JSON) rendered by a vetted spec-driven
renderer over a fixed chart catalog** — NOT dynamic-Worker-generated UI. Rationale + Cloudflare doc
citations in [RESEARCH.md §1](RESEARCH.md). Worker Loaders (`WORKER_LOADERS`) is open-beta,
sandboxed-compute-only, and shipping LLM-authored UI code to homeowners is an XSS risk; it is
reserved (optional, Phase 5) for sandboxed **derived-metric compute** whose JSON output folds back
into the spec. **Confirm this before Phase 2.**

## 3. Scope

In: thread/message/plan/spec persistence; the homeowner agent (goal interview → plan → approve →
spec → render → edit) on the existing ChatBroker DO; spec-driven `DashboardRenderer`; reusable chart
template catalog (incl. shadcn Leaflet map markers + clusters); the `agentic_sf_context` seed +
self-serve config panel; thread switcher; persistent assistant-ui modal; new Hono/zod-openapi APIs.

Out (now): auth/multi-tenant accounts; scheduled monitoring/alerts (designed-for, Phase 6); writing
back to DBI; dynamic-worker UI generation.

## 4. Capabilities consumed (validated live — [RESEARCH.md §2](RESEARCH.md))

8 homeowner use cases, all returning live rows via `/api/r2/query`: permit timeline/funnel,
inspector culture, addenda complexity, contractor reputation, similar-permit finder, cost benchmarks,
complaint/NOV hot-spots, corruption/anomaly red-flags. **The 8 SQL gotchas in RESEARCH.md §2 are
mandatory** in the NL→SQL prompt and named-query templates.

## 5. Data model (D1, new domain `src/backend/db/schemas/storyteller/`)

- **threads** — id, title, goal_category, goal_summary, address?, parcel_block_lot?, lat?, lng?, status, last_message_at, created_at, updated_at
- **messages** — id, thread_id→threads, role, content, tool_calls(json), token_usage(json)?, created_at  (index thread_id, created_at)
- **thread_data_plans** — id, thread_id→threads, message_id→messages?, plan(json), status(proposed|approved|superseded), version, created_at
- **dashboard_specs** — id, thread_id→threads, plan_id→thread_data_plans?, spec(json `DashboardSpec`), version, status(draft|live|superseded), created_at, updated_at
- **agentic_sf_context** — id, category, topic, content, data_signals(json), homeowner_action, priority, enabled, created_at, updated_at  (seeded from agentic_sf_context.seed.json)
- **named_queries** — id, thread_id?, label, sql, params(json), created_at  (reusable guarded SQL referenced by spec blocks; thread_id null = global template)
- **thread_filters** — id, thread_id→threads, filters(json FilterState), is_active(bool), label?, created_at  (global filters propagate to bound blocks)

All via Drizzle + `drizzle-kit generate`; barrel `index.ts`; re-export from `db/schema.ts`.

## 6. DashboardSpec contract (agent emits → renderer consumes)

Ordered `blocks`; each block is one allowlisted type: `narrative` (markdown), `kpi_cards`, `chart`
(template id + encoding), `map` (markers|clusters), `table`, `callout` (info|warn|red_flag). A block
references data via `QueryRef` = `{mode:"named", queryId}` or `{mode:"inline", sql}` (inline is
guard-validated server-side). Global `filters` bind by param name into queries; changing a filter
re-runs only bound blocks. Charts use `fill="var(--foreground)"` (NOT `hsl(var(--foreground))`).
Full TypeScript shape in [PROMPT.md](PROMPT.md) §DashboardSpec.

## 7. Agent tool catalog (on ChatBroker, alongside existing analytics tools)

`set_goal`, `geocode_address`, `list_context`, `save_data_plan`, `propose_dashboard`,
`approve_dashboard`, `update_dashboard_block`, `find_similar_permits`, `inspector_profile`,
`contractor_reputation`, `permit_timeline`, `redflag_scan`. The last five build guarded R2 SQL via
the existing data-platform client and return rows **plus** a reusable `namedQueryId` the agent can
drop straight into a spec block. Signatures in [PROMPT.md](PROMPT.md) §Tools.

## 8. Agent state machine

`INTENT_CLARIFY → GOAL_SET → PLAN_PROPOSED → PLAN_APPROVED → SPEC_DRAFT → DASHBOARD_LIVE`, with
follow-up edits looping on `update_dashboard_block`/filter changes, and `set_goal` forking a new
plan. **Never propose a dashboard before the plan is user-approved; never auto-approve** — approval
is an explicit user action surfaced as an assistant-ui confirm. Transitions↔tools in
[RESEARCH.md](RESEARCH.md)/[PROMPT.md](PROMPT.md).

## 9. Frontend surface

- `/storyteller` (or `/threads/[id]`): 3 zones — **left** `ThreadSwitcher` (toggle goals/threads),
  **center** `DashboardRenderer` + global `FilterBar`, **bottom-right** persistent `AssistantModal`
  (assistant-ui → ChatBroker keyed by threadId).
- `/storyteller/context`: `ContextConfigPanel` — self-serve CRUD over `agentic_sf_context`.
- **Chart template catalog** (`components/storyteller/charts/`): `map_markers`, `map_clusters`
  (aggregated counts), `permit_lifecycle` (funnel), `histogram`, `grouped_bar`, `stacked_bar`,
  `scatter`, `ranked_bar` (value labels), `kpi_row`, `comparison_table`, `callout`, `narrative`.
  Each maps to a recharts/Leaflet primitive + a documented data shape. Dark theme, high-contrast
  white labels, existing `@/components/ui/map` + shadcn `ChartContainer`.

## 10. New API routes (Hono + zod-openapi)

`/api/threads` (CRUD + `:id` detail w/ messages, live spec, active filters); `/api/threads/:id/plans`
(+ `/approve`); `/api/threads/:id/specs` (+ `/approve`, `PATCH /blocks`); `/api/context` (CRUD);
`/api/threads/:id/filters`. Reuse `POST /api/r2/query` (guarded) for all block data. Each family
`/health` + D1 logging per existing conventions.

## 11. Acceptance criteria

1. New `storyteller` D1 schema migrated; `agentic_sf_context` seeded (62 rows).
2. Homeowner agent runs the full state machine: interviews → sets goal → proposes plan → on approval
   produces a `DashboardSpec` persisted per thread → renders live; threads listed + switchable.
3. `DashboardRenderer` renders every block type from the catalog with **live R2 SQL** data, dark
   theme, high-contrast white chart labels, map markers + clusters working.
4. Follow-up chat in the bottom-right modal edits the live dashboard (block add/remove/change,
   filter change) via `update_dashboard_block`, persisted as a new spec version.
5. At least the 8 validated use cases are expressible as named-query templates the agent can compose.
6. `agentic_sf_context` is CRUD-editable in the config panel; context measurably grounds agent output.
7. All `/api/*` zod-openapi typed, in `/openapi.json`; `pnpm lint && pnpm build` green; deployed via
   `pnpm run deploy`; charts/tables show skeletons while loading.

## 12. Non-goals / risks

Red-flag metrics are **triage candidates, not accusations** — UI must frame them as "worth a look,"
never as findings of misconduct (legitimate explanations exist, e.g. OTC = same-day by design).
Snapshot is ~2024–2026 (no long-term trends). Avoid arbitrary code execution in the public UI
(declarative-spec design enforces this).

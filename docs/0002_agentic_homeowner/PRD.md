# PRD — Agentic SF-Homeowner DBI Storyteller

**Status:** Plan (architecture CONFIRMED: hybrid — see §2). Iterating on artifacts per user feedback; not yet building.
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

## 2. Architecture decision (CONFIRMED: HYBRID)

Per-thread bespoke UI is **primarily a declarative `DashboardSpec` (JSON)** rendered by a vetted
spec-driven renderer over a **fully-specified** chart catalog, **plus** a **dynamic-worker custom
chart escape hatch** for anything the catalog can't express. The frontend renders declarative blocks
+ custom blocks side by side as if all native. Custom charts are produced by a Dynamic Worker
(`WORKER_LOADERS`, `globalOutbound:null`) that returns an **inert artifact** (a known-grammar chart
spec drawn client-side, or sanitized server-rendered SVG embedded read-only) — **never executable UI
code in the browser**. Rationale + Cloudflare doc citations: [RESEARCH.md §1](RESEARCH.md).

Two cross-cutting mandates from this decision:
- **Shared chart style profile** ([RESEARCH.md §1a](RESEARCH.md)): every chart (declarative AND
  custom) uses one style module — `var(--foreground)` label text (never `hsl(var(--foreground))`),
  white value labels, a single graduated **blue** hue family (no rainbow). Every shadcn Recharts
  family is represented with its full API config surface.
- **Centralized badge-color utils** ([RESEARCH.md §1b](RESEARCH.md), `lib/dbi-badges.ts`): the single
  source for trade-category / permit-type / status / neighborhood badge colors + the rounded green
  cost badge — identical everywhere.

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
- **permit_tags** — id, permit_number, category, source(description|addenda|inspection), run_id, model, confidence?, created_at  (Workers-AI free-text enrichment output, §6.4; index on category and permit_number)
- **enrichment_runs** — id, kind(description|addenda|inspection), status(queued|running|done|failed), request_id?, external_reference?, model, counts(json), created_at, updated_at  (tracks batch tagging jobs)

All via Drizzle + `drizzle-kit generate`; barrel `index.ts`; re-export from `db/schema.ts`.

## 6. DashboardSpec contract (agent emits → renderer consumes)

Ordered `blocks`; each block is one allowlisted type: `narrative`, `kpi_cards`, `chart`
(shadcn-Recharts family + full encoding), `map` (markers|clusters), `permits_table` (the standard
permits table, §6.2), `gantt` (permit schedule), `timeline_steps` (permit milestones), `table`,
`callout` (info|warn|red_flag), and `custom` (dynamic-worker artifact, §6.3). A block references
data via `QueryRef` = `{mode:"named", queryId}` or `{mode:"inline", sql}` (inline guard-validated).
Global `filters` (the page **data-scope**, §6.1) bind by param name; changing a filter re-runs only
bound blocks. Every chart uses the shared style profile. Full TypeScript shape in
[PROMPT.md §DashboardSpec](PROMPT.md).

### 6.1 Data-scope filters + pending-changes Save UX
Each page loads with a correct source **data scope**, shown as editable filters (date range, permit
trade/type, status, neighborhood, geo bbox, cost band, text). When the user edits a filter the page
shows a top **shadcn Alert** — *"There are pending changes to the filtered data scope — click Save to
update the configuration."* — with a **Save** button. Saving writes the active `thread_filters` row;
on save the affected blocks show **shadcn Skeletons** while the backend refetches, then re-render
with fresh data. Filters are interactive and persist per thread.

### 6.2 Standard permits table (`permits_table` block)
The canonical table for "show the permits underlying this page," with sort + search + column filters.
Columns: **permit_number** (links to the permit-viewport modal), **trade category** (colored badge,
`lib/dbi-badges.ts` — e.g. `building` = black/white), **permit type** (colored badge), **status**
(colored badge), **site address** [street number + street name] (default sort groups all permits for
the same address together), **neighborhood** (colored badge — e.g. Portola = purple), **total cost**
(rounded green badge: $300 / $42k / $1.2M), **has-addenda flag** (true if the `building` permit — or
the building permit a child electrical/plumbing permit rolls up to — has addenda rows; addenda
viewable in the permit viewport), **description** (wraps; never causes horizontal scroll).

### 6.3 Custom charts (`custom` block, dynamic worker)
When the catalog can't express a request, the agent emits a `custom` block whose data/spec is
produced by a sandboxed Dynamic Worker (`globalOutbound:null`). The worker returns an **inert
artifact**: preferred = a known-grammar chart spec (Vega-Lite JSON) rendered by a vetted client lib;
fallback = sanitized server-rendered SVG embedded read-only. The renderer treats it as a first-class
block. No worker-authored JS/React reaches the browser; the shared style profile still applies.

### 6.4 Free-text enrichment (Workers AI structured tagging)
Persona 6/7/8 signals (in-kind vs new, street-facing, 25%-slope/Planning triggers, post-disaster
rebuild, phasing) live only in **free text**. A Workers-AI pipeline tags it into a `category →
permit-numbers` map stored in `permit_tags`, consumable as a first-class filter. Details in
[RESEARCH.md §4](RESEARCH.md):
- **Model** `@cf/moonshotai/kimi-k2.6` (~261k ctx) via `MODEL_TAGGER`; `response_format` json_schema
  forces `{tags:[{category,permits[]}]}`; persona-aware system prompt (exact schema/prompt in
  [PROMPT.md §Enrichment](PROMPT.md)).
- **Input** = concatenated markdown of `permit_number: text` (separate corpora for descriptions,
  addenda-comments-by-permit, inspection comments).
- **3 modes**: sync (single/small), batch (`queueRequest:true` + `external_reference`), poll
  (`request_id`). Results upsert `permit_tags`; jobs tracked in `enrichment_runs`; admin/cron-triggered,
  incremental on new permits.
- **Taxonomy** seeded + extensible (windows/skylight in-kind|new|street_facing, roof/solar,
  electrical:panel_upgrade, kitchen/bath in-kind|reconfig, adu, planning:slope_25pct|planning_commission|
  historic_review, change_of_use, post_disaster:*, code_upgrade_required, nov_abatement,
  unpermitted_legalization, open_permit, phased_build, red_flag:*).
- **Consumption**: `permit_tags` joins into named-query templates + a `tag` filter on `permits_table`
  and charts; agent gets a `find_permits_by_tag` tool. Directly serves personas 6/7/8.

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
- **Chart/component catalog** (`components/storyteller/charts/`), all on the shared style profile
  (`lib/chart-style.ts`) and badge utils (`lib/dbi-badges.ts`):
  - **Full shadcn Recharts families** with their complete API config surface (each a thin wrapper
    exposing all documented props via the spec `encoding`): **area** (+ stacked/step/gradient),
    **bar** (vertical/horizontal/grouped/stacked/with value labels), **line** (+ multi/step/dots),
    **pie/donut** (+ label/legend variants), **radar**, **radial**, **scatter**. One blue hue family.
  - **Registry components**: `map_markers` + `map_clusters` (aggregated counts) on `@/components/ui/map`;
    **Gantt** (`gantt` block) — permit schedule from SODA/warehouse events (application date, approved,
    addenda events, inspection dates, completed) for the permit viewport; **ISO `YYYY-MM-DD` only,
    never a timestamp** (base on abui `timeline` — `npx shadcn@latest add timeline`); **timeline-steps**
    (`timeline_steps` block) for a permit's key milestones (abui `timeline-steps`).
  - **Standard permits table** (§6.2), **kpi_row**, **comparison_table**, **callout** (red-flag), **narrative**, **custom** (§6.3).
- **Badge utils** `lib/dbi-badges.ts` — central trade-category / permit-type / status / neighborhood
  colors + rounded green cost badge; used by the permits table, permit viewport, and any field block.
- **Permit viewport modal** — reuse/extend the existing `PermitViewer`; opened from any `permit_number`
  link; includes the Gantt + timeline-steps for that permit and its addenda rows.
- **Data-scope filter bar + pending-changes Save alert + skeleton-on-refetch** (§6.1) on every page.

## 10. New API routes (Hono + zod-openapi)

`/api/threads` (CRUD + `:id` detail w/ messages, live spec, active filters); `/api/threads/:id/plans`
(+ `/approve`); `/api/threads/:id/specs` (+ `/approve`, `PATCH /blocks`); `/api/context` (CRUD);
`/api/threads/:id/filters`; **enrichment** `/api/enrich/sync`, `/api/enrich/batch`,
`/api/enrich/poll?request_id=`, `GET /api/permit-tags` (filter by category/permit). Reuse
`POST /api/r2/query` (guarded) for all block data. Each family `/health` + D1 logging per conventions.

## 11. Acceptance criteria

1. New `storyteller` D1 schema migrated; `agentic_sf_context` seeded (62 rows).
2. Homeowner agent runs the full state machine: interviews → sets goal → proposes plan → on approval
   produces a `DashboardSpec` persisted per thread → renders live; threads listed + switchable.
3. `DashboardRenderer` renders every block type from the catalog with **live R2 SQL** data, dark
   theme, **shared blue style profile**, high-contrast `var(--foreground)` labels (no black-on-black),
   map markers + clusters, Gantt + timeline-steps (ISO dates only) in the permit viewport.
4. **Full shadcn Recharts catalog** present (area/bar/line/pie/radar/radial/scatter + variants),
   each exposing its full API config via spec `encoding`, all on the one blue style profile.
5. **Standard permits table** (§6.2) works wherever permits underlie a page: permit_number → viewport
   modal, badged trade/type/status/neighborhood (from `dbi-badges.ts`), green rounded cost badge,
   address-grouped sort, has-addenda flag, wrapping description, sort + search + filters.
6. **Data-scope filters** editable per page; editing shows the pending-changes Save alert; Save
   refetches with skeletons then re-renders.
7. **Custom (dynamic-worker) charts**: a request the catalog can't express renders as a `custom`
   block from a sandboxed worker (inert artifact), styled to match — no browser code execution.
8. Follow-up chat in the bottom-right modal edits the live dashboard via `update_dashboard_block`
   (new spec version); thread switching swaps the whole experience.
9. At least the 8 validated use cases are expressible as named-query templates; `agentic_sf_context`
   seeded (78) + CRUD-editable and measurably grounds agent output.
9a. **Free-text enrichment** runs (sync + batch + poll) and populates `permit_tags` from permit
    descriptions + addenda comments; tags are filterable in `permits_table`/charts and via the agent's
    `find_permits_by_tag` tool — demonstrably enabling persona 6/7/8 queries (e.g. "street-facing
    window permits", "permits that triggered Planning Commission / 25% slope", "phased roof→solar→
    kitchen builds nearby", "post-disaster rebuilds").
10. All `/api/*` zod-openapi typed + in `/openapi.json`; `pnpm lint && pnpm build` green; deployed via
    `pnpm run deploy`; charts/tables show skeletons while loading.

## 12. Non-goals / risks

Red-flag metrics are **triage candidates, not accusations** — UI must frame them as "worth a look,"
never as findings of misconduct (legitimate explanations exist, e.g. OTC = same-day by design).
Snapshot is ~2024–2026 (no long-term trends). Avoid arbitrary code execution in the public UI
(declarative-spec design enforces this).

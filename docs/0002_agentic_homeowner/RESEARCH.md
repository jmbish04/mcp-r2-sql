# Research & Decisions — Agentic SF-Homeowner DBI Storyteller

Synthesis of a 4-stream research/brainstorm session (architecture, live data validation,
domain/persona, system design). This is the grounding for `PRD.md` / `TASKS.json` / `PROMPT.md`.

---

## 1. Render architecture — HYBRID (CONFIRMED by user)

**Primary = declarative `DashboardSpec`. Escape hatch = sandboxed dynamic-worker "custom" charts
rendered as first-class blocks.** Most UI is a JSON `DashboardSpec` (ordered blocks referencing a
**fully-specified catalog** of vetted chart/map/table/narrative components + guarded SQL), persisted
per thread in D1 and drawn by one spec-driven `DashboardRenderer` in the deployed Astro bundle.
Follow-up chat edits are **JSON patches** to the spec.

When the homeowner asks for something the declarative catalog can't express, the agent renders a
**custom chart in a Dynamic Worker** (`WORKER_LOADERS`, `globalOutbound:null`, no network) that
returns an **inert artifact** — preferably a known-grammar chart spec (e.g. Vega-Lite JSON) drawn by
a vetted client renderer, otherwise **server-rendered, sanitized SVG** embedded read-only. It shows
on the page as a `custom` block that looks like any other chart. **No worker-authored JS/React ever
executes in the browser** — that is the security line that keeps the hybrid safe.

Why this split (not "dynamic Workers build all the UI"):
- **Worker Loaders is open-beta, paid-only**, positioned by Cloudflare as a **server-side sandbox
  for untrusted/AI-generated code** (Code Mode), not a UI-delivery mechanism. Refs:
  `https://developers.cloudflare.com/dynamic-workers/` ,
  `https://developers.cloudflare.com/changelog/post/2026-03-24-dynamic-workers-open-beta/`.
- Its isolate protects **our Worker**, not the browser; emitting LLM-authored React to homeowners is
  an XSS surface. So dynamic workers produce **data/inert artifacts**, never executable UI.
- Declarative blocks fit Astro island hydration, have no cold start, and edit as cheap JSON patches;
  custom blocks are the rare, sandboxed exception. Dynamic workers also cover the optional
  **derived-metric compute** case (agent transform → JSON → spec block) via the same sandbox.

### 1a. Shared chart STYLE PROFILE (every chart, declarative or custom)
One central style module so the user **never** sees black-on-black text:
- All label/axis/legend text = `var(--foreground)` (NEVER `hsl(var(--foreground))`); bar value
  labels white, inside/top.
- Single **blue** family in graduated hues (shadcn `--chart-1..5` blue ramp / `color-mix` toward
  background), not a rainbow — identical across every chart family.
- **Every** shadcn Recharts family (area, bar, line, pie/donut, radar, radial, scatter + their
  documented variants) is represented with its **full API config surface** exposed via the spec
  `encoding`, all sharing this profile. Custom (dynamic-worker) charts must adopt the same profile.

### 1b. Centralized BADGE-COLOR utils (consistency everywhere)
A single module (`src/frontend/lib/dbi-badges.ts`) is the ONLY source of badge colors so a value
looks identical on every page: permit **trade category** (e.g. `building` = black bg / white text),
permit **type**, **status**, and SF **neighborhood** (e.g. `Portola` = purple, always). Cost badges
render rounded + green ($300 / $42k / $1.2M). Consumed by the permits table, permit viewport, and any
block showing these fields.

---

## 2. Live data validation (all 8 homeowner use cases work)

Validated against the deployed `POST /api/r2/query` (R2 SQL, namespace `sf_dbi`). Snapshot scale:
34,119 building_permits; ~112k building_inspections; 177,451 permit_addenda.

**SQL gotchas that MUST be encoded in the agent's NL→SQL prompt + named-query templates:**
1. Percentiles: `approx_percentile_cont(col, q)` (NOT `approx_percentile`).
2. `building_permits.revised_cost` is a **STRING** → `CAST(revised_cost AS DOUBLE)`; filter out `'0.0'`.
3. `building_inspections.result` is `'PASSED'`/`'FAILED'` uppercase with ~26,938 NULLs → rate over
   `result IN ('PASSED','FAILED')` only.
4. `permit_addenda.processing_hours` is mostly 0 (OTC/intake) → filter `processing_hours > 0` for
   station bottleneck analysis; 0 ≠ "fast".
5. `"Owner"` (owner-builder) dominates `permit_contractors` → exclude for true contractor leaderboards.
6. Contractor timeline needs a join (`permit_contractors` has no `days_to_issue`) → join `building_permits` on `permit_number`.
7. No window functions / OFFSET / `func(DISTINCT)` → use `HAVING` thresholds, two-step queries, `approx_distinct()`.
8. `complaints.resolution_days` (low medians) and `is_long_running` (high counts) use different
   definitions → report both, don't reconcile.

| # | Use case | Chart | Notes |
|---|---|---|---|
| 1 | Permit timeline / funnel (filed→issued→completed days by type/neighborhood) | histogram + funnel | `days_to_issue` p50/p90; OTC ~0d, "additions alterations or repairs" p90 ~242d |
| 2 | Inspector culture in a neighborhood (per-inspector volume + pass/fail) | grouped/stacked bar + scatter | fail-rate over decided inspections only |
| 3 | Addenda complexity / stuck reviews (processing_hours, is_stuck, holds by station) | ranked bar | PPC station p90 ~4,656h; 1,400 stuck rows |
| 4 | Contractor reputation (volume + completion + avg days, exclude Owner) | ranked bar + scatter | needs join to building_permits |
| 5 | Find similar permits (description ILIKE + neighborhood → cost + timeline) | table + map markers | `location` plots markers |
| 6 | Cost benchmarks (estimated/revised cost p50/p90 by neighborhood/type) | box/grouped bar + histogram | CAST revised_cost |
| 7 | Complaint / NOV hot-spots (count, long-running, resolution by neighborhood) | map clusters + ranked bar | |
| 8 | Corruption / anomaly red-flags (same-day high-value issuance; inspector pass-rate outliers; near-zero addenda hours) | scatter + ranked bar | candidates/triage, NOT accusations |

**Snapshot limitations:** ~2024–2026 only (no long-term trend); rates exclude large NULL buckets;
red-flag metrics are triage filters with legitimate explanations (OTC = same-day by design); cohort
comparison (z-score vs peers) must be two-step (no `OVER()`).

---

## 3. Homeowner personas (the lens)

1. **First-time remodeler** — wants "what's normal" baselines; fear: overpaying expediters / under-scoping.
2. **ADU builder** — slowest, most discretionary path; fear: 12-month plan dragged to 30.
3. **Post-purchase renovator** — inherited unknown history; fear: open permits / unpermitted work / NOVs on the parcel.
4. **Dispute-with-contractor owner** — needs an evidence trail (license-to-scope mismatch, abandoned addenda).
5. **Corruption-wary owner** — the reason the data matters: recognize gravity-defying issuance, plan-checker
   favoritism, inspector clean-result anomalies — *establish the legitimate baseline, then flag deviation.*
6. **Budget-conscious owner** — wants "what's normal" baselines; fear: overpaying expediters / under-scoping. Rebuilding after storm or fire or disaster where rebuilding can become complex and expensive given the updated building codes, complexity of the project, and the need to get the project done quickly and efficiently baring in mind the homeowner is likely under tremendous stress and anxious about the complexity and cost of the project making them vulnerable to scams and exploitation by unscrupulous actors and greedy contractors providing misinformation about how long the project will take, the cost of the project, and the complexity of the project while also setting the homeowners expectations and providing realistic timelines and costs based on the data.
7. **Phased-concious owner** -- wants to break their large remodel into phases by looking at permits for similar projects in their neighborhood and seeing how long they took and what the costs were -- like focusing on a phase to repair the roof, install solar, windows / skylights (street facing vs non-street facing, code requirements for specific window types due to neighborhood historic review, etc.; code requirements for installing skylights # ft away from property line as a new skylight vs. requirements for in kind replacement of skylights and whether new building code mandated the skylight to change due to # ft from poperty line, etc) upgrade electrical panel to a higher amperage, remodel a bathroom / kitchen (in kind vs moving walls or plumbing), landscaping / backyard, etc. Also identifying permits that triggered or required scary things like San Francisco Planning Commission Review for things like 25% slope in the backyard, historic landmark review, etc. that can complicate and extend timelines.
8. **Remote / Out of state owner** -- living outside of SF while remodeling their property in SF. Needs to be able to understand timelines, costs, permits required, city regulations, etc. while also being able to identify red flags or potential issues that may arise during the project.   

Tool job for every persona: **baseline → deviation → monitor.** Monitoring (saved searches on
address/contractor/neighborhood for new complaints/NOVs/holds) turns a lookup into early warning.

Personas **6 (post-disaster/budget), 7 (phased), 8 (remote)** depend heavily on signals that live
**only in free text** (e.g. "in-kind vs new windows", "street-facing", "25% slope triggered Planning
Commission", "rebuild to current code after fire") — see §4 enrichment.

See `agentic_sf_context.seed.json` (78 rows) for the pre-loaded expert context that keeps the agent
razor-focused across all categories (regulatory navigation, permit process, cost benchmarks,
contractor vetting, corruption red-flags, inspector culture, timeline expectations, neighborhood
context, data signals, homeowner actions, **plus post-disaster, phased-build, and remote-owner**
rows). Corruption content is documented-pattern level (no fabricated named accusations).

---

## 4. Free-text enrichment pipeline (Workers AI structured tagging)

Structured columns can't answer the persona-6/7/8 questions. We enrich permits by running their
**free text** (permit `description`, `permit_addenda` review/hold comments, inspection
`inspection_description`) through Workers AI to extract a **category → permit-numbers** map, stored
as first-class tags the agent and named-queries can filter on.

- **Model:** `@cf/moonshotai/kimi-k2.6` (≈261k context — big enough to tag thousands of rows per
  call). Configurable via a `MODEL_TAGGER` var.
- **Structured output:** `response_format: { type: "json_schema", json_schema: … }` forcing
  `{ tags: [{ category, permits: string[] }] }` (see PROMPT.md for the exact schema + persona-aware
  system prompt the user supplied).
- **Input shaping:** concatenated **markdown** of `permit_number: text` (one corpus for descriptions;
  a second corpus of addenda comments grouped by permit_number; optionally inspection comments).
- **Execution modes** (3 endpoints): **sync** (`/api/enrich/sync`) for one permit / small chunk;
  **batch** (`/api/enrich/batch`, `queueRequest: true` with `external_reference` per chunk) for the
  full corpus; **poll** (`/api/enrich/poll?request_id=`) to collect results. Results upsert into
  `permit_tags(permit_number, category, source, run_id, model, confidence?)`.
- **Tag taxonomy** (seed; extensible): `windows:inkind|new|street_facing`, `skylight:inkind|new_setback`,
  `roof:repair|replace`, `solar:pv`, `electrical:panel_upgrade`, `kitchen:inkind|reconfig`,
  `bath:inkind|reconfig`, `adu`, `foundation|structural|soft_story`, `landscaping|backyard|deck`,
  `planning:dr|planning_commission|historic_review|slope_25pct|setback_variance`,
  `change_of_use`, `post_disaster:fire|storm`, `code_upgrade_required`, `nov_abatement`,
  `unpermitted_legalization`, `open_permit`, `phased_build`,
  `red_flag:timeline_anomaly|fast_high_value|owner_builder_high_value`.
- **Consumption:** `permit_tags` joins into named-query templates and the `permits_table`/charts as a
  tag filter, so "phased-build roof/solar/window permits near me", "permits that triggered Planning
  Commission / 25% slope", or "in-kind vs new windows" become one filter — directly serving personas
  6/7/8. The agent gets a `find_permits_by_tag` tool.
- **Refresh:** an admin/cron-triggered batch job tags the corpus and re-runs incrementally on newly
  ingested permits (tag rows carry `run_id`).

---

## 5. Subagent provenance

- Architecture/render decision — Cloudflare dynamic-worker research agent (cited docs above).
- Data validation — live R2 SQL analyst (8 use cases run against production endpoint).
- Personas + 62-row context seed — SF remodel/expediter/DBI-corruption domain team.
- D1 schema + spec type + tool catalog + state machine + chart catalog — system designer (see PRD §).

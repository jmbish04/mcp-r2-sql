# Research & Decisions — Agentic SF-Homeowner DBI Storyteller

Synthesis of a 4-stream research/brainstorm session (architecture, live data validation,
domain/persona, system design). This is the grounding for `PRD.md` / `TASKS.json` / `PROMPT.md`.

---

## 1. Key architectural decision — how per-thread bespoke dashboards are rendered

**Recommendation: declarative dashboard spec, NOT dynamic-Worker-generated UI.**

The agent emits a **JSON `DashboardSpec`** (ordered blocks referencing a fixed catalog of vetted
chart/map/narrative components + guarded SQL). The spec is persisted per thread in D1; a single
spec-driven `DashboardRenderer` (part of the already-deployed Astro bundle) renders it. Follow-up
chat edits are **JSON patches** to the spec (new version), not regenerated code.

Why not "dynamic Workers build the UI" (the prompt's tentative idea):
- **Worker Loaders (`WORKER_LOADERS` / `env.LOADER.get(id, …)`) is open-beta, paid-only**, and
  Cloudflare positions it as a **sandbox for running untrusted/AI-generated code server-side**
  (Code Mode), not a UI delivery mechanism. Refs:
  `https://developers.cloudflare.com/dynamic-workers/` ,
  `https://developers.cloudflare.com/changelog/post/2026-03-24-dynamic-workers-open-beta/`.
- The isolate protects **our Worker** from generated code; it does **nothing** to stop XSS in the
  rendered page — we'd still be shipping LLM-authored code to homeowners' browsers.
- It defeats Astro island hydration (build-time component graph) and re-introduces cold-starts on
  every per-thread edit.

The declarative-spec approach wins on security (no arbitrary code in the public UI — renderer only
honors an allowlist of block types), latency (no extra cold start), Astro fit (each block is a
normal hydrated island), editability (cheap JSON patch), and storage (versioned spec rows in D1).

**Where Worker Loaders *may* add value later (optional, Phase 5+):** sandboxed per-thread
**derived-metric compute** — if a homeowner asks for a computed metric the catalog can't precompute,
the agent emits a pure transform run in a Dynamic Worker with `globalOutbound: null` (no network);
its **output is plain JSON folded back into the same spec**. Never UI code. This keeps the door open
to the prompt's "dynamic workers" intent without the XSS/architecture cost.

> ⚠️ This is the one decision to confirm before building — it changes the whole build shape.

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

Tool job for every persona: **baseline → deviation → monitor.** Monitoring (saved searches on
address/contractor/neighborhood for new complaints/NOVs/holds) turns a lookup into early warning.

See `agentic_sf_context.seed.json` (62 rows, 10 categories) for the pre-loaded expert context that
keeps the agent razor-focused (regulatory navigation, permit process, cost benchmarks, contractor
vetting, corruption red-flags, inspector culture, timeline expectations, neighborhood context,
data signals, homeowner actions). Corruption content is documented-pattern level (no fabricated
named accusations).

---

## 4. Subagent provenance

- Architecture/render decision — Cloudflare dynamic-worker research agent (cited docs above).
- Data validation — live R2 SQL analyst (8 use cases run against production endpoint).
- Personas + 62-row context seed — SF remodel/expediter/DBI-corruption domain team.
- D1 schema + spec type + tool catalog + state machine + chart catalog — system designer (see PRD §).

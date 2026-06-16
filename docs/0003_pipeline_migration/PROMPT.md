# Prompt — Add Workers AI permit enrichment to the SF DBI ingestion pipeline

> Hand this verbatim to the coding agent working on the **ingestion-pipeline Worker**
> (the batch loader that feeds the R2 Data Catalog namespace `sf_dbi`). It is
> self-contained — the agent needs no access to the consuming app repo.

---

## Goal
Today our consuming app enriches permits *after the fact* (a separate Worker calls
Workers AI and writes a `permit_tags` D1 table that maps `category → [permit_numbers]`).
That's post-hoc and only usable as a filter. **Move enrichment upstream into this
ingestion pipeline so that AI-derived tags and extractions are computed during load
and persisted as first-class columns/fields on the permit records in the warehouse**,
queryable directly via R2 SQL alongside the native DBI fields.

The warehouse is the R2 Data Catalog namespace `sf_dbi` (Iceberg tables, ~548k rows,
batch-loaded). Enrichment should run as part of that batch load.

## What to extract (per permit record)
For each permit, concatenate its free text — `description`, addenda/scope comments,
and inspection comments — and extract a structured object. Emit BOTH:
1. A normalized `scope_tags` string array (the taxonomy below), for flexible filtering.
2. Scalar columns (booleans / enums / score / summary) so common questions are a
   plain `WHERE`, not a join. These are the new fields the app will read.

Recommended new columns (adapt names to our conventions; all nullable, default false/0):

| Column | Type | Meaning |
|---|---|---|
| `enrich_scope_tags` | TEXT (JSON array) | normalized taxonomy tags |
| `enrich_trade` | TEXT | primary trade: building\|electrical\|plumbing\|mechanical\|roofing\|solar\|other |
| `enrich_is_adu` | BOOLEAN | accessory dwelling unit |
| `enrich_is_unpermitted_legalization` | BOOLEAN | legalizing prior unpermitted work |
| `enrich_has_open_nov` | BOOLEAN | notice-of-violation / abatement language |
| `enrich_is_post_disaster` | BOOLEAN | fire/storm rebuild |
| `enrich_requires_planning_review` | BOOLEAN | discretionary / planning commission / variance |
| `enrich_is_historic_review` | BOOLEAN | historic resource review |
| `enrich_is_street_facing` | BOOLEAN | street-facing windows/facade |
| `enrich_is_solar` | BOOLEAN | solar PV |
| `enrich_is_panel_upgrade` | BOOLEAN | electrical panel upgrade |
| `enrich_is_soft_story` | BOOLEAN | soft-story retrofit |
| `enrich_is_change_of_use` | BOOLEAN | occupancy/use change |
| `enrich_is_phased` | BOOLEAN | phased build |
| `enrich_red_flag_score` | REAL | 0–1 corruption/anomaly signal |
| `enrich_red_flag_reasons` | TEXT (JSON array) | short reason strings |
| `enrich_summary` | TEXT | one-line, homeowner-readable |
| `enrich_confidence` | REAL | 0–1 |
| `enrich_model` | TEXT | model id used |
| `enrich_content_hash` | TEXT | hash of source free text (idempotency) |
| `enrich_version` | INTEGER | bump when prompt/schema changes to force re-enrich |
| `enrich_updated_at` | TIMESTAMP | last enriched |

Taxonomy for `enrich_scope_tags` (a permit may have several):
`windows:inkind|new|street_facing`, `skylight:inkind|new_setback`, `roof:repair|replace`,
`solar:pv`, `electrical:panel_upgrade`, `kitchen:inkind|reconfig`, `bath:inkind|reconfig`,
`adu`, `foundation`, `structural`, `soft_story`, `landscaping`,
`planning:slope_25pct|planning_commission|historic_review|setback_variance`,
`change_of_use`, `post_disaster:fire|storm`, `code_upgrade_required`, `nov_abatement`,
`unpermitted_legalization`, `open_permit`, `phased_build`,
`red_flag:timeline_anomaly|fast_high_value|owner_builder_high_value`.

## Model + call contract (proven — reuse exactly)
- Model: `@cf/moonshotai/kimi-k2.6` (large context, best quality) via the Workers AI
  binding `env.AI.run(...)`. For throughput-sensitive runs, `@cf/openai/gpt-oss-120b`
  is a faster alternative with the same structured-output mechanism — make the model
  id a config var (`MODEL_TAGGER`) so it's swappable.
- Use JSON-schema structured output via `response_format`. Set `max_tokens: 16000`.
- **GOTCHA (this cost us hours): Kimi returns the OpenAI shape — the JSON lives at
  `res.choices[0].message.content` as a STRING that must be `JSON.parse`d.** Do not
  assume `res.response`. Parse defensively across `res.choices[0].message.content`,
  `res.response`, `res.result`, `res` and `JSON.parse` strings; if parse fails, regex
  out the first `{...}` block. A naive read yields empty results silently.
- Use the **batch queue API** (`env.AI.run(model, { queueRequest: true, requests: [...] })`
  with `external_reference` per chunk, then poll by `request_id`) for the full corpus —
  per-record synchronous calls are far too slow (~90s each for Kimi). Chunk multiple
  permits per request.

Per-record JSON schema (force structured output):

```json
{
  "type": "json_schema",
  "json_schema": {
    "type": "object",
    "properties": {
      "permit_number": { "type": "string" },
      "scope_tags": { "type": "array", "items": { "type": "string" } },
      "trade": { "type": "string" },
      "is_adu": { "type": "boolean" },
      "is_unpermitted_legalization": { "type": "boolean" },
      "has_open_nov": { "type": "boolean" },
      "is_post_disaster": { "type": "boolean" },
      "requires_planning_review": { "type": "boolean" },
      "is_historic_review": { "type": "boolean" },
      "is_street_facing": { "type": "boolean" },
      "is_solar": { "type": "boolean" },
      "is_panel_upgrade": { "type": "boolean" },
      "is_soft_story": { "type": "boolean" },
      "is_change_of_use": { "type": "boolean" },
      "is_phased": { "type": "boolean" },
      "red_flag_score": { "type": "number" },
      "red_flag_reasons": { "type": "array", "items": { "type": "string" } },
      "summary": { "type": "string" },
      "confidence": { "type": "number" }
    },
    "required": ["permit_number", "scope_tags", "summary"]
  }
}
```

System prompt (homeowner-persona aware — keep verbatim, it's tuned):

```
You are an expert San Francisco Department of Building Inspection (DBI) permit analyst.
Analyze each permit's concatenated description, addenda, and inspector comments and
extract structured data points relevant to these homeowner personas:
1. First-time remodeler (normal baselines). 2. ADU builder (long discretionary paths).
3. Post-purchase renovator (unpermitted work, open NOVs). 4. Dispute-with-contractor
owner (license-to-scope mismatch, abandoned addenda). 5. Corruption-wary owner
(favoritism, gravity-defying issuance, clean-result anomalies). 6. Budget-conscious /
post-disaster rebuilder (code upgrades). 7. Phased-conscious owner (roof, solar,
street-facing windows, skylights, electrical panel, kitchen/bath, historic/planning
review). 8. Remote / out-of-state owner (red-flag visibility, timeline reality checks).
Return ONLY the JSON object matching the schema. Use the provided tag taxonomy. Set
red_flag_score in [0,1] with concrete red_flag_reasons (timeline anomalies, fast
high-value issuance, owner-builder high-value). Do not invent facts not in the text.
Be exhaustive with scope_tags; never leave it empty if any scope is described.
```

## Pipeline integration requirements
- **Incremental + idempotent.** Compute `enrich_content_hash` from the normalized
  source free text. Only call the model when (a) the row is new, (b) the hash changed,
  or (c) `enrich_version` is below the current code version. Never re-enrich unchanged
  rows — this is the cost and rate-limit control.
- **Scale with Queues or Workflows**, not one giant request. Producer enqueues
  permit-number batches during load; a consumer drains them, calls the batch AI API,
  parses, and writes back. Respect Workers AI rate limits with backoff; make batch
  size and concurrency config vars.
- **Where to write:** prefer materializing the `enrich_*` columns directly on the
  permit table during the Iceberg load so R2 SQL can filter on them natively. If
  altering the Iceberg schema mid-pipeline is impractical, write a parallel
  `permit_enrichment` table keyed by `permit_number` (+ `enrich_content_hash`) and
  document the join. **State the choice you made and why** — the consuming app needs
  to know whether to read columns or join a table.
- **Backfill path:** provide a one-shot/maintenance entrypoint to enrich the existing
  ~548k-row corpus in batches (resumable, logs progress), plus the incremental path
  for ongoing loads.
- **Partial failure tolerance:** a permit that fails extraction must not block the
  batch — record null enrich fields + a failure marker and continue; make it retryable.

## Observability & ops
- Track each job (queued|running|done|failed, model, request_id, chunk ref, counts
  {permits, tagged, failed}). Mirror the consuming app's existing `enrichment_runs`
  concept so dashboards can read job state.
- Emit structured logs and a `/health` (or pipeline status) signal with last-run
  timestamp and rows-enriched counts.
- Make the model id, batch size, concurrency, and `enrich_version` config/env vars.

## Constraints
- Verify all Cloudflare specifics (Workers AI batch API shape, Queues/Workflows
  bindings, R2 Data Catalog / Iceberg schema-evolution rules) against current
  Cloudflare docs before implementing — APIs drift. Use the `cloudflare-docs` MCP if available.
- TypeScript Worker with `env.AI` binding preferred; if the loader is Python/PyIceberg,
  call Workers AI via the REST API with the same schema/prompt/parse logic.
- Don't hardcode tokens; use existing secret/binding conventions.

## Acceptance criteria
1. A fresh batch load populates the `enrich_*` fields for new/changed permits.
2. Re-running the load does NOT re-call the model for unchanged rows (verify via logs/counts).
3. `SELECT ... WHERE enrich_is_adu = true` (and other scalar fields) returns sensible
   rows via R2 SQL — no app-side post-processing needed.
4. Backfill enriches the existing corpus in resumable batches without exhausting rate limits.
5. A spot-check of ~20 permits shows accurate tags/summaries (the model returns
   non-empty results — confirm the `choices[0].message.content` parse path works).
6. Job status + counts are observable; failures are isolated and retryable.

## Hand-off contract (what the consuming app needs back)
When done, report to the app team:
- The exact column names + types added (or the `permit_enrichment` table shape + join key).
- Whether they live on the `sf_dbi` permit table or a sidecar table.
- The `enrich_version` value and how to query "is this permit enriched yet".
- Any new R2 SQL query gotchas for the enriched fields (e.g. JSON-array filtering).

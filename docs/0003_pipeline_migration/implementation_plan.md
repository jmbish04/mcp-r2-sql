# 0003 — Enrichment pipeline migration & app-side compatibility plan

**Status:** planned (2026-06-16). Blocked on the ingestion-pipeline Worker shipping
the `enrich_*` fields (see [PROMPT.md](./PROMPT.md)).

## 1. The shift

| | Today (app-side, post-hoc) | Target (pipeline-owned) |
|---|---|---|
| Where AI runs | Consuming app Worker (`/api/enrich/*`), on demand | Ingestion pipeline, during batch load |
| Output shape | `permit_tags` D1 table: `category → [permit_number]` map | `enrich_*` columns on the `sf_dbi` permit record (or a `permit_enrichment` sidecar) |
| Queryability | App-side join against `permit_tags` D1 | Native R2 SQL `WHERE enrich_is_adu = true` |
| Job tracking | `enrichment_runs` D1 table | Pipeline's own job tracking |
| Freshness | Manual re-run of `/api/enrich/batch` | Automatic, incremental, idempotent per load |

The win: enrichment becomes a **property of the data**, not a feature of the app.
Every consumer (storyteller, vetting, dashboards, ad-hoc R2 SQL) gets it for free,
and the app stops paying for / orchestrating AI tagging.

## 2. Current app-side inventory (what exists to migrate)

Producers (write `permit_tags` / `enrichment_runs` via Workers AI):
- `src/backend/ai/providers/permit-tagger.ts` — Kimi k2.6 tagging: `permitExtractionSchema`,
  `TAGGER_SYSTEM_PROMPT`, `tagSync`, `tagBatchSubmit`, `tagBatchPoll`, `extractTags`, `recordsToMarkdown`.
- `src/backend/api/routes/enrich.ts` → `enrichRouter` (writes): `POST /api/enrich/sync`,
  `POST /api/enrich/batch`, `GET /api/enrich/poll` (+ `upsertTags` helper).
- `src/backend/db/schemas/enrichment/{permit-tags,enrichment-runs,index}.ts` — the two tables.
- `wrangler.jsonc` var `MODEL_TAGGER = @cf/moonshotai/kimi-k2.6`.

Consumers (read `permit_tags`):
- `src/backend/api/routes/enrich.ts` → `permitTagsRouter` (reads): `GET /api/permit-tags`
  (list, filter by category/permit), `GET /api/permit-tags/categories` (distinct + counts).
- `src/backend/ai/agents/storyteller/tools.ts` → `find_permits_by_tag` tool
  (`tools.ts:202`) selects `permitTags.permitNumber/category` where `category IN (...)`.
- `src/backend/storyteller/templates.ts` → named query `nq_permits_by_tag` (`templates.ts:115`).
- `src/backend/db/schema.ts` → `export * from "./schemas/enrichment"` (`schema.ts:29`).
- Storyteller frontend filters that surface tag categories as a filter control.

## 3. Compatibility matrix (file → action)

| File / surface | Action | Notes |
|---|---|---|
| `ai/providers/permit-tagger.ts` | **Deprecate → delete** | AI tagging now lives in the pipeline. Keep the taxonomy/schema as the canonical reference in PROMPT.md, then remove the module once parity is verified. |
| `api/routes/enrich.ts` `enrichRouter` (`/sync`,`/batch`,`/poll`) | **Deprecate → delete** | The app no longer triggers tagging. Return `410 Gone` for one release, then remove + unmount. |
| `api/routes/enrich.ts` `permitTagsRouter` (`/api/permit-tags*`) | **Repoint, keep path** | Back the same response shape with a query over the new `enrich_*` columns (R2 SQL distinct/group-by) so existing clients don't break. `/categories` becomes a group-by over `enrich_scope_tags`. |
| `ai/agents/storyteller/tools.ts` `find_permits_by_tag` | **Repoint** | Replace the `permitTags` D1 select with an R2 SQL query filtering `enrich_scope_tags` / scalar `enrich_*` columns via the existing `runBlockQuery` guard. Drop the `permitTags` import. |
| `storyteller/templates.ts` `nq_permits_by_tag` | **Repoint** | Rewrite the SQL to filter `sf_dbi` on `enrich_*` columns (or join the sidecar table) instead of the D1 tag map. Add scalar-field named queries (e.g. `nq_permits_red_flags`, `nq_adu_permits`). |
| `storyteller/store.ts` `bindParams` (`*_list` passthrough) | **Keep / verify** | The `:categories_list` raw passthrough still works for `IN (...)` over the new columns. No change expected; add a test. |
| `db/schemas/enrichment/*` + `db/schema.ts:29` re-export | **Remove after parity** | Drop the `permit_tags` + `enrichment_runs` tables and the barrel re-export once read surfaces are repointed and verified. Generate a Drizzle migration to drop them. |
| `wrangler.jsonc` `MODEL_TAGGER` | **Remove** | App no longer calls Workers AI for tagging. (Pipeline owns its own model var.) |
| Storyteller frontend tag filter | **Repoint** | Source filter options from the repointed `/api/permit-tags/categories` (now column-backed). Add scalar-field toggles (ADU, red-flag, post-disaster, …) as first-class filters. |
| `AGENTS.md` "Free-text enrichment" note | **Update** | Point to pipeline ownership; describe the `enrich_*` columns + how to query them. |
| `docs/0002_agentic_homeowner/*` enrichment refs | **Annotate** | Add a note that enrichment moved to 0003 / the pipeline. |

## 4. Phases

### Phase A — Pipeline ships fields (other repo)
Owned by the ingestion-pipeline agent via [PROMPT.md](./PROMPT.md). Done when the
hand-off contract is delivered: column names/types, on-table vs sidecar, `enrich_version`,
and R2 SQL query notes. **All app-side phases below depend on this.**

### Phase B — App reads new fields (additive, dual-read)
No deletions yet. Add column-backed reads behind a feature flag / fallback so the app
works whether or not a given permit is enriched.
- Add the `enrich_*` columns to the app's `sf_dbi` schema description
  (`data-platform/schema-data.ts` / `docs/cslb-schema.json`) so R2 SQL typing + the
  agent's `describe_schema` know about them.
- Repoint `find_permits_by_tag` and `nq_permits_by_tag` to query columns, with a
  fallback to the `permit_tags` table when a permit isn't enriched yet (dual-read).
- Repoint `/api/permit-tags*` reads to be column-backed (same response shape).
- Add scalar-field named queries + filters (ADU, red-flag, post-disaster, etc.).

### Phase C — Stop app-side writes
- `410 Gone` on `/api/enrich/{sync,batch,poll}`; remove the storyteller/admin entry
  points that triggered them.
- Stop seeding/writing `permit_tags` / `enrichment_runs`.

### Phase D — Remove dual-read + drop tables
Once R2 SQL coverage of `enrich_*` is verified ≥ parity with `permit_tags`:
- Delete `permit-tagger.ts`, the `enrichRouter`, the dual-read fallback.
- Drop `permit_tags` + `enrichment_runs` (Drizzle migration), remove the
  `schemas/enrichment` barrel + `schema.ts:29` re-export, remove `MODEL_TAGGER`.
- Run `pnpm cf-typegen`, typecheck, lint, deploy, `git push`.

## 5. Risks & rollback
- **Schema drift between repos.** The app hard-codes column names in named queries.
  Mitigate: pipeline delivers the hand-off contract; keep column names in ONE place
  (`schema-data.ts`) and reference it.
- **Iceberg schema evolution.** If the pipeline can't add columns to the live table,
  it falls back to a `permit_enrichment` sidecar — the app must then JOIN. Phase B
  named queries should be written so swapping column-access for a join is localized.
- **Coverage gap during backfill.** Until backfill completes, some permits are
  unenriched. The Phase B dual-read fallback covers this; don't run Phase D until
  backfill coverage is confirmed.
- **Rollback.** Phases B/C are reversible (flag flip / un-deprecate). Phase D is the
  point of no return — gate it on a verified coverage report.

## 6. Verification
- R2 SQL: `WHERE enrich_is_adu = true`, red-flag ordering, `enrich_scope_tags` membership.
- Storyteller `find_permits_by_tag` returns the same/better results as the old D1 path
  on a sample of categories.
- `/api/permit-tags/categories` still returns `{category,count}[]` (now column-backed).
- Coverage report: `count(enrich_updated_at is not null) / count(*)` over `sf_dbi`.
- `pnpm lint` + `tsc` green; deploy; spot-check `/storyteller` filters live.

## 7. Companion files
- [PROMPT.md](./PROMPT.md) — the self-contained brief for the pipeline Worker agent.
- [TASKS.json](./TASKS.json) — phased, dependency-ordered task list (app-side + hand-off).

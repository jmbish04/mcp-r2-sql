# PROMPT.md — Coding-agent brief: Agentic SF-Homeowner DBI Storyteller

You are building the feature specified in this folder. **Read first, in order:**
1. [PRD.md](PRD.md) — what & why, scope, acceptance.
2. [RESEARCH.md](RESEARCH.md) — the architecture decision (§1), **live-validated data + 8 SQL gotchas (§2)**, personas (§3).
3. [TASKS.json](TASKS.json) — work in dependency order; flip `status` per task; commit per id.
4. [agentic_sf_context.seed.json](agentic_sf_context.seed.json) — seed data for `agentic_sf_context`.
5. Repo root `AGENTS.md` + `.agent/rules/*` + the `cloudflare-jedi` conventions (already in force).

## Absolute rules (inherited)
- `Bindings: Env` on Hono; never define `interface Bindings`. After any binding change run `pnpm cf-typegen` (never hand-edit `worker-configuration.d.ts`).
- All `/api/*` are zod-openapi typed and appear in `/openapi.json`; each route family exposes `/health` and logs to the D1 logging layer.
- Drizzle only (no raw SQL migrations): `pnpm db:generate`. Schema path `src/backend/db/schemas/storyteller/<table>.ts` + barrel; re-export from `db/schema.ts`.
- Frontend: Astro SSR + React islands, dark shadcn, shared header, mobile-responsive, sort+filter on tables, errors via the global ErrorLogger, no `window.alert/confirm/prompt` (use shadcn Dialog/AlertDialog). Tables/charts show **skeletons while loading**.
- **Charts: `fill="var(--foreground)"` for all label/axis text (NEVER `hsl(var(--foreground))` — `--foreground` is OKLCH; the hsl() wrapper renders black). Bar value labels white, inside/top. Reuse `@/components/ui/map` (Leaflet) for maps and shadcn `ChartContainer` for recharts.**
- Reuse the existing **ChatBroker** `AIChatAgent` DO and its analytics tool catalog (`src/backend/ai/agents/analytics/tools.ts`); reuse the data-platform R2 SQL guard + `POST /api/r2/query`. One thread = one ChatBroker session keyed by `threadId`. Invoke agents via RPC (`getAgentByName`)/`@callable`, never `stub.fetch`.
- Secrets via the typed getters in `src/backend/utils/secrets.ts` (`env.X.get()` pattern). `GOOGLE_MAPS_API` powers Places autocomplete; map display is keyless Leaflet.
- Deploy only via `pnpm run deploy`. Keep `pnpm lint && pnpm build` green.

## ⛔ Gate: confirm decision D0 before Phase 2
Build on the **declarative `DashboardSpec`** approach (RESEARCH.md §1). Do NOT generate user-facing UI
via Worker Loaders. If the user has not confirmed D0, stop and ask.

## DashboardSpec (the agent↔renderer contract)
```ts
type GoalCategory = "buy_assess"|"renovate"|"dispute"|"inspector_vet"|"contractor_vet"|"neighborhood"|"compliance"|"general";

type DashboardSpec = {
  version: 1; title: string; subtitle?: string; goal_category: GoalCategory;
  filters: FilterDecl[];            // global controls; bind into queries by param name
  blocks: Block[];                  // ordered render list
};
type FilterDecl = { id: string; kind: "date_range"|"select"|"multiselect"|"geo_bbox"|"text";
  label: string; param: string; options?: {value:string;label:string}[]; default?: unknown };
type QueryRef =
  | { mode:"named"; queryId: string; bind?: Record<string,string> }
  | { mode:"inline"; sql: string; bind?: Record<string,string> };   // inline -> guard server-side
type BlockBase = { id: string; title?: string; span?: 1|2|3|4; query?: QueryRef };
type Block =
  | (BlockBase & { type:"narrative"; markdown: string })
  | (BlockBase & { type:"kpi_cards"; query: QueryRef; cards: {label:string; valueField:string; format?:"num"|"usd"|"days"|"pct"; deltaField?:string; intent?:"neutral"|"good"|"bad"}[] })
  | (BlockBase & { type:"chart"; query: QueryRef; chart: ChartTemplateId; encoding: ChartEncoding })
  | (BlockBase & { type:"map"; query: QueryRef; map: { render:"markers"|"clusters"; latField:string; lngField:string; weightField?:string; labelField?:string; tooltipFields?:string[] } })
  | (BlockBase & { type:"table"; query: QueryRef; columns: {field:string; header:string; format?:string; sortable?:boolean}[] })
  | (BlockBase & { type:"callout"; severity:"info"|"warn"|"red_flag"; markdown:string; query?:QueryRef; actionRef?:string });
type ChartTemplateId = "permit_lifecycle"|"histogram"|"grouped_bar"|"stacked_bar"|"scatter"|"ranked_bar";
type ChartEncoding = { x?:string; y?:string|string[]; series?:string; value?:string; stacked?:boolean; sort?:"asc"|"desc"; valueLabels?:boolean };
```
Renderer rules: validate every block against the type allowlist; resolve `query` + active
`thread_filters` (bind param→:placeholder) → guarded `/api/r2/query`; cache by (queryId|sqlHash,
resolvedParams); a filter change re-runs only blocks whose `bind` references it.

## Tools (add to ChatBroker; zod-validated I/O)
| Tool | Inputs → Output |
|---|---|
| set_goal | {threadId, goalCategory, goalSummary, address?} → {thread} |
| geocode_address | {address} → {lat,lng,parcel_block_lot,normalized} (Google Places/Geocoding via GOOGLE_MAPS_API) |
| list_context | {category?, topic?} → {items:[{topic,content,data_signals,homeowner_action,priority}]} |
| save_data_plan | {threadId, plan, fromMessageId?} → {planId, version, status:"proposed"} |
| propose_dashboard | {threadId, planId?, spec} → {specId, version, status:"draft"} (validates spec; registers inline queries as named) |
| approve_dashboard | {threadId, specId} → {specId, status:"live"} |
| update_dashboard_block | {threadId, specId, op:"upsert"|"remove", block?} → {specId, version} |
| find_similar_permits | {address?|bbox, permitType?, yearsBack?, limit?} → {rows[], summaryStats, namedQueryId} |
| inspector_profile | {inspectorName} → {inspector, metrics, recentInspections[], namedQueryId} |
| contractor_reputation | {licenseNo?|name} → {contractor, permitCount, completionRate, avgDaysToIssue, flags[], namedQueryId} |
| permit_timeline | {permitNo?|parcel} → {stages:[{stage,enteredAt,days}], totalDays, namedQueryId} |
| redflag_scan | {address?|parcel|bbox} → {flags:[{rule,severity,evidenceQueryId,count}]} |

Scope tools (find_similar_permits, inspector_profile, contractor_reputation, permit_timeline,
redflag_scan) build guarded R2 SQL via the data-platform client and return rows **plus** a reusable
`namedQueryId` so the agent drops the same query into a spec block.

## State machine (enforce in system prompt)
`INTENT_CLARIFY → GOAL_SET (set_goal) → PLAN_PROPOSED (save_data_plan) → PLAN_APPROVED (user
confirms) → SPEC_DRAFT (propose_dashboard) → DASHBOARD_LIVE (approve_dashboard)`; follow-ups loop on
`update_dashboard_block`/filter writes; `set_goal` forks. **Never propose a dashboard before the plan
is approved; never auto-approve.** Always `list_context` to ground reasoning; obey the 8 SQL gotchas.

## Build order
Follow TASKS.json: A1→A2 (schema+seed), A3→A5 (APIs+named queries), [confirm D0], B1→B3 (spec
validator + tools + agent prompt), C1→C5 (chart catalog → renderer → switcher+modal → context panel →
page+nav), D1T (lint/build/deploy/verify + AGENTS.md). E1/E2 optional.

## Definition of done
PRD §11 acceptance criteria all pass against a **live deploy**: interview → goal → plan → approve →
bespoke live dashboard (real R2 SQL, dark theme, high-contrast white labels, maps with
markers+clusters) → edit via the bottom-right assistant-ui modal → thread switching; context seeded
(62 rows) + CRUD-editable; `/openapi.json` live; red-flags framed as triage, never accusations.

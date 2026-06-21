/**
 * @fileoverview Docs content — "Features" category (storyteller, property watch,
 * enrichment).
 */

import type { DocPage } from "../types";

const UPDATED = "2026-06-19T17:00:00Z";

export const featurePages: DocPage[] = [
  {
    slug: "features/storyteller",
    title: "Storyteller",
    category: "features",
    order: 1,
    summary: "The agentic, thread-based homeowner tool and its state machine.",
    lastUpdated: UPDATED,
    content: `# Storyteller

The Storyteller (\`/storyteller\`) is an agentic, **thread-based** tool: one goal
= one thread. A per-thread Durable Object agent interviews the homeowner,
records an evolving plan in D1, and on approval renders a bespoke dashboard of
charts + narrative + red-flag callouts. Switch threads to swap the whole
experience; the floating assistant (bottom-right) drives and edits it.

## The state machine

\`\`\`mermaid
stateDiagram-v2
  [*] --> INTENT_CLARIFY
  INTENT_CLARIFY --> GOAL_SET: set_goal
  GOAL_SET --> PLAN_PROPOSED: save_data_plan
  PLAN_PROPOSED --> PLAN_APPROVED: user approves
  PLAN_APPROVED --> SPEC_DRAFT: propose_dashboard
  SPEC_DRAFT --> DASHBOARD_LIVE: approve_dashboard
  DASHBOARD_LIVE --> DASHBOARD_LIVE: update_dashboard_block / set_filters
  DASHBOARD_LIVE --> GOAL_SET: pivot (set_goal again)
\`\`\`

The agent **never** proposes a dashboard before the plan is user-approved, and
never auto-approves.

## Render contract (hybrid)

The dashboard is a declarative **DashboardSpec** (JSON) — a block allowlist +
chart-family allowlist + query refs + filter bindings, validated server-side.
The custom-chart escape hatch returns an **inert** AI-picked catalog chart
(never browser-executed code).

\`\`\`mermaid
flowchart LR
  SPEC[DashboardSpec JSON] --> VAL[validateSpec]
  VAL --> BR[BlockRenderer]
  BR --> CHART[Recharts catalog]
  BR --> TBL[Permits table]
  BR --> MAP[Leaflet map]
  BR --> CUST[Custom: AI picks a catalog chart]
\`\`\`

## Tools

The agent has the storyteller workflow tools (set_goal, save_data_plan,
propose/approve/update dashboard, set_filters) plus scope tools
(find_similar_permits, inspector_profile, contractor_reputation,
permit_timeline, redflag_scan, find_permits_by_tag) and the live
\`property_signals\` + \`dbi_workload\` tools — all spread over the analytics
toolkit. Replies always end with text; markdown renders as formatted HTML.`,
  },
  {
    slug: "features/property-watch",
    title: "Property Watch",
    category: "features",
    order: 2,
    summary: "Live per-property signals, City review-pace charts, and an AI read.",
    lastUpdated: UPDATED,
    content: `# Property Watch

Property Watch (\`/property\`) is the "keep an eye on my home during a
renovation" surface. Enter a property (block+lot and/or street + ZIP) and it
pulls the full live picture, with charts and an AI read.

\`\`\`mermaid
flowchart TD
  IN[Property input<br/>block/lot · street · zip] --> APP[PropertyWatch island]
  APP -->|/api/property/signals| CARDS[Signal KPI cards]
  APP -->|/api/property/dbi-workload| CHARTS[Review-pace charts]
  APP -->|/api/property/insight| AI[AI read<br/>Workers AI]
  APP --> TABLES[Per-dataset detail tables]
\`\`\`

## What's on the page

- **Signal cards** — one per watched dataset. Concern signals (Notices of
  Violation, complaints, fire inspections) glow red when non-zero.
- **AI read** — a grounded homeowner narrative: headline → summary → "keep an
  eye on" → timeline-vs-City-pace → recommendations. One Workers AI call over
  the signals + the review-pace baseline (~10s; the panel shows a skeleton).
- **Review-pace charts** — DBI issuance (OTC vs in-house), Planning pace by
  stage, completeness stat. See **Data Platform → City Review Pace**.
- **Detail tables** — collapsible, curated columns, ISO dates, met-SLA badges.

The property is mirrored to the URL (\`?block=&lot=&streetNumber=…\`) so a watch
is shareable and survives reloads.`,
  },
  {
    slug: "features/enrichment",
    title: "Enrichment Pipeline",
    category: "features",
    order: 3,
    summary: "Workers AI free-text tagging today, and the move to pipeline-owned columns.",
    lastUpdated: UPDATED,
    content: `# Enrichment Pipeline

Permit free text (description / addenda / inspection comments) is classified by
**Workers AI** (\`@cf/moonshotai/kimi-k2.6\`) into a homeowner-relevant taxonomy
(e.g. \`windows:street_facing\`, \`planning:slope_25pct\`, \`post_disaster:fire\`,
\`red_flag:timeline_anomaly\`).

\`\`\`mermaid
flowchart LR
  TXT[Permit free text] --> CHUNK[Chunk + batch]
  CHUNK --> AI[Workers AI<br/>kimi-k2.6 JSON schema]
  AI --> PARSE[Parse choices0.message.content]
  PARSE --> TAGS[(permit_tags<br/>category to permits)]
  TAGS --> FILTER[find_permits_by_tag filter]
\`\`\`

## Gotcha

Kimi returns the **OpenAI shape** — the JSON lives at
\`res.choices[0].message.content\` as a string that must be \`JSON.parse\`d (with
\`max_tokens: 16000\`). A naive read of \`res.response\` yields empty results
silently.

## Where it's headed

Today enrichment is a post-hoc app-side step writing a \`permit_tags\` D1 table
(a category → permits map). The plan is to move it **upstream into the ingestion
pipeline** so the tags + extractions become first-class \`enrich_*\` columns on
the warehouse records, queryable natively. See **Reference → Pipeline
Migration** for the full plan and compatibility matrix.`,
  },
];

/**
 * @fileoverview Docs content — "Overview" category (introduction + architecture).
 */

import type { DocPage } from "../types";

const UPDATED = "2026-06-19T17:00:00Z";

export const overviewPages: DocPage[] = [
  {
    slug: "overview",
    title: "Introduction",
    category: "overview",
    order: 1,
    summary: "What this platform is and the surfaces it exposes.",
    lastUpdated: UPDATED,
    content: `# Introduction

**R2 SQL Analytics** is an analytics + agentic-storytelling platform over **San
Francisco DBI** (Department of Building Inspection) permit data, deployed as a
single **Cloudflare Worker** with Astro SSR + React islands.

It turns raw permit data into something a homeowner — or an analyst — can act on:
guarded SQL over a petabyte-scale warehouse, live per-property signals from
DataSF, an AI agent that builds bespoke dashboards, and a "watch my property"
surface with an AI read.

## The surfaces

| Surface | Route | What it does |
| --- | --- | --- |
| **Warehouse** | \`/\` | KPI dashboard + the full recharts suite over the R2 SQL warehouse. |
| **Storyteller** | \`/storyteller\` | Agentic, thread-based tool — the agent interviews you, then builds a bespoke dashboard. |
| **Property Watch** | \`/property\` | Live DataSF signals for one property + an AI read of what to watch. |
| **Workbench** | \`/workbench\` | Query workbench paired with an analytics chat agent. |
| **Vetting** | \`/vetting\` | Vet contractors / architects / engineers against permit history. |

## What makes it different

- **Guarded R2 SQL** — every query passes a read-only guard (no writes, enforced
  \`LIMIT\`, no \`OFFSET\`/window functions) before it reaches the warehouse.
- **Live + warehouse** — per-property signals are live DataSF (SODA) lookups;
  cross-property analytics run against the R2 Data Catalog warehouse.
- **Agentic** — a per-thread Durable Object agent drives the storyteller
  workflow (interview → plan → approve → render → edit).
- **Grounded AI** — every AI surface cites concrete numbers and treats red flags
  as triage candidates, never accusations.

> New here? Start with **Architecture**, then jump to the feature you care about.`,
  },
  {
    slug: "architecture",
    title: "Architecture",
    category: "overview",
    order: 2,
    summary: "How the Worker, Astro SSR, D1, R2 SQL, and the Agents SDK fit together.",
    lastUpdated: UPDATED,
    content: `# Architecture

Everything ships as **one Cloudflare Worker**: Astro SSR pages + React islands
for the frontend, a Hono API for \`/api/*\`, Durable Objects for the agents, D1
(Drizzle) for app state, and R2 SQL + DataSF for the warehouse/live data.

\`\`\`mermaid
flowchart TD
  U[Browser: Astro SSR + React islands] -->|/api/*| H[Hono API on the Worker]
  U -->|WebSocket /agents/*| DO[Durable Objects]
  H --> D1[(D1 + Drizzle\\napp state)]
  H --> R2[(R2 SQL\\nsf_dbi warehouse)]
  H --> SODA[DataSF SODA\\nlive per-property]
  H --> AI[Workers AI\\nvia AI Gateway]
  DO -->|StorytellerAgent| AI
  DO -->|ChatBroker| AI
  DO --> R2
  DO --> SODA
\`\`\`

## Layers

- **Frontend** — Astro SSR (\`@astrojs/cloudflare\`) with React islands hydrated
  per-page (\`client:load\` / \`client:only\`). Dark "Monolith" shadcn theme.
- **API** — Hono + \`@hono/zod-openapi\`; every route is typed and self-documents
  at \`/openapi.json\`, \`/swagger\`, \`/scalar\`. Each family exposes \`/health\` and
  logs to a mirrored D1 layer.
- **Agents** — Cloudflare Agents SDK \`AIChatAgent\` Durable Objects:
  \`ChatBroker\` (analytics chat) and \`StorytellerAgent\` (one instance per goal
  thread). Bound over WebSocket via \`useAgent\`.
- **Data platform** — \`src/backend/data-platform/\`: the R2 SQL client + guard,
  the SODA dataset registry, derived permit status, and the catalog client.

## Request flow (a guarded warehouse query)

\`\`\`mermaid
sequenceDiagram
  participant UI as React island
  participant API as Hono /api/r2/query
  participant G as SQL guard
  participant R2 as R2 SQL
  UI->>API: POST { sql }
  API->>G: guardSql(sql)
  alt rejected
    G-->>API: { allowed:false, reason }
    API-->>UI: 400 + reason
  else allowed
    G-->>API: { allowed:true, sql }
    API->>R2: queryR2Sql(sql)
    R2-->>API: rows + metrics
    API-->>UI: rows (logged to D1)
  end
\`\`\`

See **Data Platform → R2 SQL Warehouse** for the guard rules and warehouse
shape, and **Reference → API** for the full endpoint inventory.`,
  },
];

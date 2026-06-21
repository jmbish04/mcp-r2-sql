/**
 * @fileoverview Docs content — "Reference" category (API, configuration,
 * pipeline migration).
 */

import type { DocPage } from "../types";

const UPDATED = "2026-06-19T17:00:00Z";

export const referencePages: DocPage[] = [
  {
    slug: "reference/api",
    title: "API Reference",
    category: "reference",
    order: 1,
    summary: "The /api/* surface — every family is zod-openapi typed.",
    lastUpdated: UPDATED,
    content: `# API Reference

Every \`/api/*\` route is **zod-openapi** typed. The live, browsable specs:

- [\`/openapi.json\`](/openapi.json) — the OpenAPI 3.1 document
- [\`/swagger\`](/swagger) — Swagger UI
- [\`/scalar\`](/scalar) — Scalar reference

## Families

| Family | Highlights |
| --- | --- |
| \`/api/r2/*\` | guarded R2 SQL query + catalog |
| \`/api/permits/*\` | SODA lookup + detail (with \`derived_status\`) |
| \`/api/property/*\` | signals · dataset/{key} · dbi-workload · insight · datasets |
| \`/api/vetting/*\` | contractor / architect / engineer vetting |
| \`/api/ai/*\` | nl2sql · interpret · anomalies · suggest · chart-insight |
| \`/api/storyteller/*\` | threads · plans · specs · filters · run-block · custom |
| \`/api/context/*\` | agentic_sf_context CRUD |
| \`/api/enrich/*\`, \`/api/permit-tags\` | Workers AI tagging + tag reads |
| \`/api/config-options/*\` | data-driven option lists |

## Property endpoints (most relevant to the new signals)

\`\`\`mermaid
flowchart TD
  P[/api/property] --> S[GET /signals]
  P --> DS[GET /dataset/:key]
  P --> W[GET /dbi-workload]
  P --> I[POST /insight]
  P --> L[GET /datasets]
  P --> H[GET /health]
\`\`\`

Every family also exposes \`/health\` and logs operations to a mirrored D1 layer.`,
  },
  {
    slug: "reference/configuration",
    title: "Configuration",
    category: "reference",
    order: 2,
    summary: "Data-driven config options and the agent context knowledge base.",
    lastUpdated: UPDATED,
    content: `# Configuration

Two things are data-driven from D1 (no redeploy to change):

## Config options (\`/admin/config\`)

A generic \`config_options\` table powers every option list — goal categories,
vetting roles, permit badge colors, neighborhoods. Managed via
\`/api/config-options\` and the self-serve admin at \`/admin/config\` (add,
relabel, recolor, reorder, deactivate).

\`\`\`mermaid
flowchart LR
  ADMIN[/admin/config UI] -->|CRUD| API[/api/config-options]
  API --> D1[(config_options)]
  D1 --> FE[Frontend dropdowns + badges]
  D1 --> AGENT[Agent goal categories]
\`\`\`

## Agent context (\`/storyteller/context\`)

\`agentic_sf_context\` is the curated knowledge the storyteller agent reasons
over — DBI culture, permit gotchas, corruption red-flags, homeowner playbooks
(78 seeded entries). Managed via \`/api/context\` and the **Agent Context** admin
at \`/storyteller/context\` (add / edit / enable per entry). Changes take effect
immediately.`,
  },
  {
    slug: "reference/pipeline-migration",
    title: "Pipeline Migration",
    category: "reference",
    order: 3,
    summary: "Moving enrichment + new datasets into the ingestion pipeline (docs/0003).",
    lastUpdated: UPDATED,
    content: `# Pipeline Migration

The ingestion pipeline (a separate Worker that batch-loads \`sf_dbi\`) is the
right home for two things the app does live today: **enrichment** and the new
**DataSF signals** at warehouse scale.

\`\`\`mermaid
flowchart TD
  subgraph App today
    A1[Post-hoc Workers AI tagging] --> A2[(permit_tags D1\\ncategory to permits)]
    A3[Live SODA per-property] --> A4[Property Watch]
  end
  subgraph Pipeline target
    B1[Enrich during batch load] --> B2[(enrich_* columns on sf_dbi)]
    B3[Ingest NOV/fire/planning/metrics] --> B4[(warehouse tables)]
  end
  A2 -.migrate.-> B2
  A4 -.warehouse-scale.-> B4
\`\`\`

## The shift

| | Today (app, post-hoc) | Target (pipeline-owned) |
| --- | --- | --- |
| Where AI runs | app Worker, on demand | ingestion pipeline, during load |
| Output | \`permit_tags\` map | \`enrich_*\` columns on \`sf_dbi\` |
| Queryable | app-side join | native \`WHERE enrich_is_adu = true\` |

## Datasets to ingest at warehouse scale

Notices of Violation (\`nbtm-fbw5\`), DBI complaints (\`gm2e-bten\`), Fire permits
(\`893e-xam6\`), Planning-review permits (\`tyz3-vt28\`), Fire inspections
(\`wb4c-6hwj\`), permit contacts (\`cw8k-gwb7\`), and the review/issuance/
completeness/planning metrics (\`5bat-azvb\`, \`gzxm-jz5j\`, \`abh5-gwaq\`,
\`d4jk-jw33\`).

Full plan, compatibility matrix, and the agent brief live in the repo under
\`docs/0003_pipeline_migration/\` (PROMPT.md, implementation_plan.md, TASKS.json).`,
  },
];

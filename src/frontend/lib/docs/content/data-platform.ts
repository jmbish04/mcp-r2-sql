/**
 * @fileoverview Docs content — "Data Platform" category (R2 SQL, property
 * signals, derived permit status, City review pace).
 */

import type { DocPage } from "../types";

const UPDATED = "2026-06-19T17:00:00Z";

export const dataPlatformPages: DocPage[] = [
  {
    slug: "data-platform/r2-sql",
    title: "R2 SQL Warehouse",
    category: "data-platform",
    order: 1,
    summary: "The sf_dbi warehouse, the read-only SQL guard, and how queries run.",
    lastUpdated: UPDATED,
    content: `# R2 SQL Warehouse

The warehouse lives in the **R2 Data Catalog** namespace \`sf_dbi\` — 10
batch-loaded SF DBI tables (~548k rows). Despite the bucket name
(\`cslb-master-licenses-sql\`) there is **no CSLB license table**; contractor
vetting uses \`sf_dbi.permit_contractors\`.

## The read-only guard

Every statement passes \`guardSql()\` before execution. It is read-only by
construction:

\`\`\`mermaid
flowchart LR
  S[Incoming SQL] --> C1{SELECT only?}
  C1 -->|no| X[Reject]
  C1 -->|yes| C2{No write keywords?}
  C2 -->|no| X
  C2 -->|yes| C3{Has LIMIT?}
  C3 -->|no| L[Inject LIMIT]
  C3 -->|yes| C4{No OFFSET / window / func DISTINCT?}
  L --> C4
  C4 -->|no| X
  C4 -->|yes| OK[Run on R2 SQL]
\`\`\`

## SQL gotchas (R2 SQL dialect)

- \`approx_percentile_cont(col, q)\` for percentiles.
- \`CAST(revised_cost AS DOUBLE)\` before numeric math on cost.
- Pass/fail rate over \`result IN ('PASSED','FAILED')\`.
- \`permit_addenda.processing_hours > 0\` for bottleneck analysis.
- Exclude \`firm_name = 'Owner'\` for contractor leaderboards.
- **No** window functions, \`OFFSET\`, or \`func(DISTINCT …)\` — use
  \`approx_distinct()\`.

## Key tables

| Table | Grain |
| --- | --- |
| \`building_permits\` | one permit |
| \`permit_addenda\` | one review/plan-check step |
| \`permit_contractors\` | firm ↔ permit (license1 / firm_name / role) |

Queries run via \`POST /api/r2/query\` (guarded) or the typed agent tools.`,
  },
  {
    slug: "data-platform/property-signals",
    title: "Property Signals (DataSF)",
    category: "data-platform",
    order: 2,
    summary: "The live SODA dataset registry for watching one property.",
    lastUpdated: UPDATED,
    content: `# Property Signals (DataSF)

Beyond the warehouse, a homeowner watching **their** property cares about a
constellation of live DataSF (Socrata/SODA) datasets — keyed by block/lot,
parcel number, or address. \`propertySignals()\` fetches them all in parallel.

\`\`\`mermaid
flowchart TD
  K[block + lot / street / zip] --> PS[propertySignals]
  PS --> NOV[Notices of Violation\\nnbtm-fbw5]
  PS --> CMP[DBI Complaints\\ngm2e-bten]
  PS --> FP[Fire Permits\\n893e-xam6]
  PS --> PR[Planning-review permits\\ntyz3-vt28]
  PS --> FI[Fire Inspections\\nwb4c-6hwj]
  PS --> PC[Permit Contacts/Firms\\ncw8k-gwb7]
  PS --> RM[Review Metrics\\n5bat-azvb]
  PS --> IM[Issuance Metrics\\ngzxm-jz5j]
\`\`\`

## Registry

Each dataset is registered with its own \`buildWhere()\` because field types
differ (e.g. \`street_number\` is a **Number** in the metrics datasets but
**Text** in NOV; \`lot\` is zero-padded text like \`005\`; \`parcel_number\` =
\`block + lot.padStart(3)\`).

| Key | DataSF id | Use |
| --- | --- | --- |
| \`notices_of_violation\` | nbtm-fbw5 | contractor/sub oversight |
| \`dbi_complaints\` | gm2e-bten | full violation picture |
| \`fire_permits\` | 893e-xam6 | sprinkler-trigger watch |
| \`planning_review\` | tyz3-vt28 | street-facing windows, etc. |
| \`fire_inspections\` | wb4c-6hwj | inspections |
| \`permit_contacts\` | cw8k-gwb7 | firms / licenses on the property |
| \`review_metrics\` | 5bat-azvb | per-station review times |
| \`issuance_metrics\` | gzxm-jz5j | filed → issued days |

## Endpoints

- \`GET /api/property/signals?block=&lot=&streetNumber=&streetName=&zip=\` — all signals.
- \`GET /api/property/dataset/{key}\` — one dataset.
- \`GET /api/property/datasets\` — the registry.

These are **live** lookups. Warehouse-scale ingestion of the same datasets is
the ingestion pipeline's job — see **Reference → Pipeline Migration**.`,
  },
  {
    slug: "data-platform/permit-status",
    title: "Derived Permit Status",
    category: "data-platform",
    order: 3,
    summary: "active / expired / inactive — homeowner-meaningful lifecycle from raw status + filed date.",
    lastUpdated: UPDATED,
    content: `# Derived Permit Status

The raw DBI \`status\` doesn't distinguish a still-live "filed" permit from one
that has effectively lapsed. \`derivePermitStatus()\` computes a
homeowner-meaningful lifecycle state from the raw status + filed date.

\`\`\`mermaid
flowchart TD
  A[status + date_filed] --> B{status = completed?}
  B -->|yes| INA[inactive]
  B -->|no| C{terminal?\\ncancel/withdraw/expire/revoke}
  C -->|yes| INA
  C -->|no| D{status = filed?}
  D -->|no| ACT[active\\nissued / in-review]
  D -->|yes| E{filed > 365 days ago?}
  E -->|yes| EXP[expired]
  E -->|no| ACT
\`\`\`

## Rules

- \`completed\` → **inactive**
- \`filed\` AND filed **> 365 days** ago → **expired** (lapsed, never issued)
- \`filed\` AND filed **≤ 365 days** ago → **active**
- issued / approved / in-review → **active**
- cancelled / withdrawn / revoked → **inactive**

## Where it surfaces

\`withDerivedStatus()\` attaches \`derived_status\` + \`filed_age_days\` to permit
rows on \`/api/permits/lookup\` and \`/api/permits/detail\`. The storyteller agent
is instructed to use this — not the raw status — when telling a homeowner
whether a permit is still live.`,
  },
  {
    slug: "data-platform/review-pace",
    title: "City Review Pace",
    category: "data-platform",
    order: 4,
    summary: "\"Is our permit slow, or is the City just busy?\" — issuance + completeness + planning baselines.",
    lastUpdated: UPDATED,
    content: `# City Review Pace

\`cityReviewPace()\` answers a homeowner's real question during a delay: *is our
permit slow, or is the City just busy right now?* It combines three live
baselines over a recent window (default 90 days).

\`\`\`mermaid
flowchart LR
  CRP[cityReviewPace] --> ISS[DBI Issuance\\ngzxm-jz5j\\nOTC vs in-house avg days]
  CRP --> COMP[Completeness Check\\nabh5-gwaq\\navg days + % met SLA]
  CRP --> PLAN[Planning Review\\nd4jk-jw33\\nby stage + % under deadline]
\`\`\`

## Why these two are aggregate-only

The completeness-check (\`abh5-gwaq\`) and planning-review (\`d4jk-jw33\`) datasets
have **no property fields** — they're keyed by an internal \`submission_id\` and a
Planning project id (\`b1_alt_id\`). So they can't be queried per-property; instead
they power the City-wide pace baseline. Negative review-day events are excluded
(per the dataset docs).

## Example (live, 90-day window)

| Signal | Reading |
| --- | --- |
| Issuance | In-House ~267d · OTC ~31d |
| Completeness | ~12d avg · ~98% met target |
| Planning | first review ~22d / 92% under deadline |

Served by \`GET /api/property/dbi-workload\`; the storyteller agent exposes it as
the \`dbi_workload\` tool, and **Property Watch** charts it.`,
  },
];

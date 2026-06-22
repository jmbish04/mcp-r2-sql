/**
 * @fileoverview Global named-query templates — the 8 validated homeowner use
 * cases (RESEARCH.md §2) + tag-join templates, seeded into
 * storyteller_named_queries (thread_id = null). Each carries `:param`
 * placeholders bound from the active thread filters via `bindParams`.
 *
 * All SQL respects the R2 SQL gotchas: approx_percentile_cont, CAST(revised_cost
 * AS DOUBLE), result IN ('PASSED','FAILED'), processing_hours>0, exclude Owner,
 * no window funcs/OFFSET/func(DISTINCT).
 */

export interface QueryTemplate {
  id: string;
  label: string;
  sql: string;
  params: Record<string, { type: "string" | "number" | "date" | "enum"; default?: string | number }>;
}

/** ${ns} is replaced with the configured R2 namespace at seed time. */
export const GLOBAL_QUERY_TEMPLATES: QueryTemplate[] = [
  {
    id: "nq_permit_timeline_by_type",
    label: "Permit timeline by type (median/p90 days to issue)",
    sql: `SELECT permit_type_definition AS t, COUNT(*) AS n,
  approx_percentile_cont(days_to_issue, 0.5) AS median_days,
  approx_percentile_cont(days_to_issue, 0.9) AS p90_days,
  AVG(days_to_issue) AS avg_days
FROM \${ns}.building_permits
WHERE days_to_issue IS NOT NULL
GROUP BY permit_type_definition ORDER BY n DESC LIMIT 15`,
    params: {},
  },
  {
    id: "nq_inspector_culture",
    label: "Inspector culture in a neighborhood (volume + fail rate)",
    sql: `SELECT inspector, COUNT(*) AS inspections,
  SUM(CASE WHEN result='PASSED' THEN 1 ELSE 0 END) AS pass_ct,
  SUM(CASE WHEN result='FAILED' THEN 1 ELSE 0 END) AS fail_ct,
  CAST(SUM(CASE WHEN result='FAILED' THEN 1 ELSE 0 END) AS DOUBLE)
    / NULLIF(SUM(CASE WHEN result IN ('PASSED','FAILED') THEN 1 ELSE 0 END), 0) AS fail_rate
FROM \${ns}.building_inspections
WHERE analysis_neighborhood = :neighborhood AND inspector IS NOT NULL
GROUP BY inspector ORDER BY inspections DESC LIMIT 25`,
    params: { neighborhood: { type: "string", default: "Mission" } },
  },
  {
    id: "nq_addenda_bottlenecks",
    label: "Addenda complexity / stuck reviews by station",
    sql: `SELECT station, COUNT(*) AS n,
  SUM(CASE WHEN is_stuck_addenda THEN 1 ELSE 0 END) AS stuck_ct,
  approx_percentile_cont(processing_hours, 0.5) AS median_hrs,
  approx_percentile_cont(processing_hours, 0.9) AS p90_hrs
FROM \${ns}.permit_addenda
WHERE processing_hours > 0
GROUP BY station ORDER BY n DESC LIMIT 20`,
    params: {},
  },
  {
    id: "nq_contractor_reputation",
    label: "Contractor reputation (volume + completion + avg days)",
    sql: `WITH c AS (
  SELECT firm_name, permit_number FROM \${ns}.permit_contractors
  WHERE role = 'contractor' AND firm_name IS NOT NULL AND firm_name <> 'Owner'
)
SELECT c.firm_name, COUNT(*) AS permits,
  AVG(p.days_to_issue) AS avg_days_to_issue,
  SUM(CASE WHEN p.status = 'complete' THEN 1 ELSE 0 END) AS completed
FROM c JOIN \${ns}.building_permits p ON c.permit_number = p.permit_number
GROUP BY c.firm_name ORDER BY permits DESC LIMIT 25`,
    params: {},
  },
  {
    id: "nq_similar_permits",
    label: "Find similar permits (keyword + neighborhood)",
    sql: `SELECT permit_number, description, estimated_cost, revised_cost, days_to_issue, status,
  street_number, street_name, neighborhoods_analysis_boundaries, location
FROM \${ns}.building_permits
WHERE description ILIKE :keyword AND neighborhoods_analysis_boundaries = :neighborhood
ORDER BY filed_date DESC LIMIT 100`,
    params: { keyword: { type: "string", default: "%kitchen%" }, neighborhood: { type: "string", default: "Noe Valley" } },
  },
  {
    id: "nq_cost_benchmarks",
    label: "Cost benchmarks by neighborhood (median/p90 revised cost)",
    sql: `SELECT neighborhoods_analysis_boundaries AS nb, COUNT(*) AS n,
  approx_percentile_cont(estimated_cost, 0.5) AS median_est,
  approx_percentile_cont(CAST(revised_cost AS DOUBLE), 0.5) AS median_rev,
  approx_percentile_cont(CAST(revised_cost AS DOUBLE), 0.9) AS p90_rev
FROM \${ns}.building_permits
WHERE revised_cost IS NOT NULL AND CAST(revised_cost AS DOUBLE) > 0
GROUP BY neighborhoods_analysis_boundaries ORDER BY n DESC LIMIT 20`,
    params: {},
  },
  {
    id: "nq_complaint_hotspots",
    label: "Complaint / NOV hot-spots by neighborhood",
    sql: `SELECT analysis_neighborhood AS nb, COUNT(*) AS complaints,
  SUM(CASE WHEN is_long_running THEN 1 ELSE 0 END) AS long_running,
  approx_percentile_cont(resolution_days, 0.5) AS median_res_days
FROM \${ns}.complaints
WHERE analysis_neighborhood IS NOT NULL
GROUP BY analysis_neighborhood ORDER BY complaints DESC LIMIT 20`,
    params: {},
  },
  {
    id: "nq_redflag_fast_highvalue",
    label: "Red-flag: high-value permits issued same day (triage)",
    sql: `SELECT permit_type_definition AS t, COUNT(*) AS n_same_day_issue
FROM \${ns}.building_permits
WHERE days_to_issue = 0 AND estimated_cost > 100000
GROUP BY permit_type_definition ORDER BY n_same_day_issue DESC LIMIT 15`,
    params: {},
  },
  {
    id: "nq_permits_by_tag",
    label: "Permits matching enrichment tags (in/near a neighborhood)",
    sql: `SELECT p.permit_number, p.permit_type_definition, p.status, p.permit_creation_date,
  p.block, p.lot, p.street_number, p.street_name, p.neighborhoods_analysis_boundaries,
  p.estimated_cost, p.revised_cost, p.description, p.location
FROM \${ns}.building_permits p
WHERE p.permit_number IN (:permit_numbers)
ORDER BY p.street_name, p.street_number, p.filed_date DESC LIMIT 300`,
    params: { permit_numbers: { type: "string", default: "''" } },
  },
];

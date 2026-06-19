/**
 * @fileoverview StorytellerAgent tool catalog. Adds the homeowner workflow tools
 * (goal/plan/spec lifecycle + scope analyses + tag search) on top of the
 * existing analytics tools. All bound to one threadId (the DO instance name).
 */

import { tool, type ToolSet } from "ai";
import { inArray } from "drizzle-orm";
import { z } from "zod";

import { buildAnalyticsTools } from "@/backend/ai/agents/analytics";
import { cityReviewPace, propertySignals } from "@/backend/data-platform";
import { getDb } from "@/backend/db";
import { permitTags } from "@db/schemas";
import {
  approveSpec,
  listContext,
  patchSpecBlock,
  runBlockQuery,
  savePlan,
  saveSpec,
  setActiveFilters,
  updateThread,
  upsertNamedQuery,
} from "@/backend/storyteller/store";

/** Single-quote-escape for inline R2 SQL string literals. */
function sq(v: string): string {
  return `'${v.replace(/'/g, "''")}'`;
}

/** Run inline guarded SQL, register it as a reusable named query, return both. */
async function runAndRegister(env: Env, threadId: string, label: string, sql: string) {
  const res = await runBlockQuery(env, { mode: "inline", sql });
  let namedQueryId: string | null = null;
  if (res.ok) {
    const nq = await upsertNamedQuery(env, { threadId, label, sql });
    namedQueryId = nq.id;
  }
  return { ok: res.ok, rows: res.rows.slice(0, 100), rowCount: res.rows.length, metrics: res.metrics, errors: res.errors, namedQueryId };
}

/** Build the full StorytellerAgent tool set for a thread. */
export function buildStorytellerTools(env: Env, threadId: string): ToolSet {
  const ns = env.R2_NAMESPACE;

  const tools = {
    set_goal: tool({
      description: "Lock the thread's goal after clarification (goal category + one-line summary, optional address).",
      inputSchema: z.object({
        goalCategory: z.string().describe("config_options(goal_category).value, e.g. renovate, contractor_vet, buy_assess"),
        goalSummary: z.string(),
        address: z.string().optional(),
        title: z.string().optional(),
      }),
      execute: async (input) => {
        const t = await updateThread(env, threadId, {
          goalCategory: input.goalCategory, goalSummary: input.goalSummary,
          address: input.address, title: input.title ?? input.goalSummary.slice(0, 60),
        });
        return { ok: Boolean(t), thread: t };
      },
    }),

    list_context: tool({
      description: "Pull enabled SF DBI expert context to ground reasoning (optionally by category).",
      inputSchema: z.object({ category: z.string().optional() }),
      execute: async ({ category }) => {
        const rows = await listContext(env, { category, enabledOnly: true });
        return { items: rows.map((r) => ({ category: r.category, topic: r.topic, content: r.content, dataSignals: r.dataSignals, homeownerAction: r.homeownerAction, priority: r.priority })) };
      },
    }),

    save_data_plan: tool({
      description: "Persist the evolving data plan (a new proposed version). Show it to the user and ask for approval.",
      inputSchema: z.object({ plan: z.record(z.string(), z.unknown()) }),
      execute: async ({ plan }) => {
        const row = await savePlan(env, threadId, plan);
        return { planId: row.id, version: row.version, status: row.status };
      },
    }),

    propose_dashboard: tool({
      description: "Emit a DashboardSpec (draft) once the plan is approved. Blocks reference named queries by id.",
      inputSchema: z.object({ spec: z.record(z.string(), z.unknown()), planId: z.string().optional() }),
      execute: async ({ spec, planId }) => {
        try {
          const row = await saveSpec(env, threadId, spec, planId);
          return { specId: row.id, version: row.version, status: row.status };
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    }),

    approve_dashboard: tool({
      description: "Make a draft dashboard spec live (only after the user approves).",
      inputSchema: z.object({ specId: z.string() }),
      execute: async ({ specId }) => {
        const row = await approveSpec(env, threadId, specId);
        return row ? { specId: row.id, status: row.status } : { ok: false, error: "not found" };
      },
    }),

    update_dashboard_block: tool({
      description: "Patch the live dashboard: add/replace (upsert) or remove a block. Persists a new live version.",
      inputSchema: z.object({ op: z.enum(["upsert", "remove"]), block: z.record(z.string(), z.unknown()) }),
      execute: async ({ op, block }) => {
        try {
          const row = await patchSpecBlock(env, threadId, op, block as { id: string });
          return { specId: row.id, version: row.version };
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    }),

    set_filters: tool({
      description: "Set the thread's active data-scope filters (param->value) that bind into block queries.",
      inputSchema: z.object({ filters: z.record(z.string(), z.unknown()) }),
      execute: async ({ filters }) => {
        const row = await setActiveFilters(env, threadId, filters);
        return { ok: true, id: row.id };
      },
    }),

    find_similar_permits: tool({
      description: "Comparable permits by description keyword + neighborhood, with cost + timeline.",
      inputSchema: z.object({ keyword: z.string(), neighborhood: z.string().optional(), limit: z.number().optional() }),
      execute: async ({ keyword, neighborhood, limit }) => {
        const where = [`description ILIKE ${sq(`%${keyword}%`)}`];
        if (neighborhood) where.push(`neighborhoods_analysis_boundaries = ${sq(neighborhood)}`);
        const sql = `SELECT permit_number, description, estimated_cost, revised_cost, days_to_issue, status, street_number, street_name, neighborhoods_analysis_boundaries, location FROM ${ns}.building_permits WHERE ${where.join(" AND ")} ORDER BY filed_date DESC LIMIT ${Math.min(Number(limit) || 100, 300)}`;
        return runAndRegister(env, threadId, `Similar permits: ${keyword}${neighborhood ? ` in ${neighborhood}` : ""}`, sql);
      },
    }),

    inspector_profile: tool({
      description: "Profile inspectors in a neighborhood: volume + pass/fail mix.",
      inputSchema: z.object({ neighborhood: z.string() }),
      execute: async ({ neighborhood }) => {
        const sql = `SELECT inspector, COUNT(*) AS inspections, SUM(CASE WHEN result='PASSED' THEN 1 ELSE 0 END) AS pass_ct, SUM(CASE WHEN result='FAILED' THEN 1 ELSE 0 END) AS fail_ct, CAST(SUM(CASE WHEN result='FAILED' THEN 1 ELSE 0 END) AS DOUBLE)/NULLIF(SUM(CASE WHEN result IN ('PASSED','FAILED') THEN 1 ELSE 0 END),0) AS fail_rate FROM ${ns}.building_inspections WHERE analysis_neighborhood = ${sq(neighborhood)} AND inspector IS NOT NULL GROUP BY inspector ORDER BY inspections DESC LIMIT 25`;
        return runAndRegister(env, threadId, `Inspector culture: ${neighborhood}`, sql);
      },
    }),

    contractor_reputation: tool({
      description: "Contractor permit volume + completion + avg days to issue (excludes Owner).",
      inputSchema: z.object({ name: z.string().optional(), license: z.string().optional() }),
      execute: async ({ name, license }) => {
        const filt = license ? `c.license1 = ${sq(license)}` : name ? `c.firm_name ILIKE ${sq(`%${name}%`)}` : `c.firm_name <> 'Owner'`;
        const sql = `WITH c AS (SELECT firm_name, license1, permit_number FROM ${ns}.permit_contractors WHERE role='contractor' AND firm_name IS NOT NULL AND ${filt}) SELECT c.firm_name, c.license1, COUNT(*) AS permits, AVG(p.days_to_issue) AS avg_days_to_issue, SUM(CASE WHEN p.status='complete' THEN 1 ELSE 0 END) AS completed FROM c JOIN ${ns}.building_permits p ON c.permit_number=p.permit_number GROUP BY c.firm_name, c.license1 ORDER BY permits DESC LIMIT 25`;
        return runAndRegister(env, threadId, `Contractor reputation: ${name ?? license ?? "all"}`, sql);
      },
    }),

    permit_timeline: tool({
      description: "Lifecycle dates for a permit (filed/issued/completed + addenda dates).",
      inputSchema: z.object({ permitNumber: z.string() }),
      execute: async ({ permitNumber }) => {
        const sql = `SELECT permit_number, status, filed_date, issued_date, completed_date, days_to_issue, permit_type_definition, description FROM ${ns}.building_permits WHERE permit_number = ${sq(permitNumber)} LIMIT 5`;
        return runAndRegister(env, threadId, `Permit timeline: ${permitNumber}`, sql);
      },
    }),

    redflag_scan: tool({
      description: "Triage red-flags in a neighborhood (same-day high-value issuance). Candidates, not accusations.",
      inputSchema: z.object({ neighborhood: z.string().optional() }),
      execute: async ({ neighborhood }) => {
        const where = ["days_to_issue = 0", "estimated_cost > 100000"];
        if (neighborhood) where.push(`neighborhoods_analysis_boundaries = ${sq(neighborhood)}`);
        const sql = `SELECT permit_number, permit_type_definition, estimated_cost, days_to_issue, street_number, street_name, neighborhoods_analysis_boundaries FROM ${ns}.building_permits WHERE ${where.join(" AND ")} ORDER BY estimated_cost DESC LIMIT 50`;
        return runAndRegister(env, threadId, `Red-flag triage${neighborhood ? `: ${neighborhood}` : ""}`, sql);
      },
    }),

    find_permits_by_tag: tool({
      description: "Find permits carrying enrichment tags (e.g. windows:street_facing, planning:slope_25pct, post_disaster:fire), optionally limited to a neighborhood.",
      inputSchema: z.object({ categories: z.array(z.string()).min(1), neighborhood: z.string().optional(), limit: z.number().optional() }),
      execute: async ({ categories, neighborhood, limit }) => {
        const tagRows = await getDb(env).select({ pn: permitTags.permitNumber, cat: permitTags.category }).from(permitTags).where(inArray(permitTags.category, categories)).limit(2000);
        const byCategory: Record<string, string[]> = {};
        const perms = new Set<string>();
        for (const r of tagRows) {
          (byCategory[r.cat] ??= []).push(r.pn);
          perms.add(r.pn);
        }
        if (perms.size === 0) return { ok: true, byCategory, rows: [], rowCount: 0, note: "No permits carry these tags yet — run the enrichment pipeline first." };
        const inList = [...perms].slice(0, 500).map((p) => sq(p)).join(",");
        const where = [`permit_number IN (${inList})`];
        if (neighborhood) where.push(`neighborhoods_analysis_boundaries = ${sq(neighborhood)}`);
        const sql = `SELECT permit_number, permit_type_definition, status, permit_creation_date, block, lot, street_number, street_name, neighborhoods_analysis_boundaries, estimated_cost, revised_cost, description, location FROM ${ns}.building_permits WHERE ${where.join(" AND ")} ORDER BY street_name, street_number LIMIT ${Math.min(Number(limit) || 300, 500)}`;
        const res = await runAndRegister(env, threadId, `Permits by tag: ${categories.join(", ")}`, sql);
        return { ...res, byCategory };
      },
    }),

    // Live "watch my property" signals across the DataSF datasets (NOV,
    // complaints, fire permits, planning review, fire inspections, permit
    // contacts, review + issuance metrics). One call → the full picture.
    property_signals: tool({
      description:
        "Pull live SF DataSF signals for a specific property: Notices of Violation, DBI complaints, Fire permits, Planning-review permits, Fire inspections, permit contacts (contractors/firms), and review/issuance metrics. Provide block+lot (best) and/or street number+name (+ zip for fire permits). Use 'only' to limit to specific dataset keys.",
      inputSchema: z.object({
        block: z.string().optional(),
        lot: z.string().optional(),
        streetNumber: z.string().optional(),
        streetName: z.string().optional(),
        zip: z.string().optional(),
        only: z.array(z.string()).optional().describe("Limit to dataset keys, e.g. notices_of_violation, fire_permits, planning_review, fire_inspections, permit_contacts, review_metrics, issuance_metrics, dbi_complaints"),
      }),
      execute: async ({ only, ...keys }) => {
        const out = await propertySignals(keys, { only, limit: 100 });
        const summary = Object.fromEntries(Object.entries(out.datasets).map(([k, v]) => [k, { ok: v.ok, count: v.count, error: v.error }]));
        return { ok: true, keys: out.keys, summary, datasets: out.datasets };
      },
    }),

    // "Is our permit slow, or is the City just busy?" — current review pace:
    // DBI issuance turnaround + completeness-check pace + Planning review pace.
    dbi_workload: tool({
      description: "Get the City's current permit review-pace baseline over a recent window: DBI issuance turnaround (avg days, OTC vs in-house), DBI completeness-check pace (avg days + % meeting target), and Planning review pace by stage (avg days + % under deadline). Use to judge whether a permit is slow vs the City's current pace.",
      inputSchema: z.object({ windowDays: z.number().optional() }),
      execute: async ({ windowDays }) => cityReviewPace(windowDays ?? 90),
    }),
  };

  return { ...buildAnalyticsTools(env), ...tools } as ToolSet;
}

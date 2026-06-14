/**
 * @fileoverview Default seed options for `config_options`.
 *
 * Idempotently loaded by `POST /api/config-options/seed`. Each entry is keyed by
 * (config_key, value); seeding inserts only missing rows so it is safe to re-run
 * and never clobbers admin edits. Extend freely — the admin page manages the
 * rest at runtime.
 */

import type { NewConfigOption } from "./config-options";

type SeedRow = Pick<NewConfigOption, "configKey" | "value" | "label"> &
  Partial<Pick<NewConfigOption, "description" | "color" | "textColor" | "sortOrder">>;

/** Storyteller thread goal categories (see docs/0002 PRD GoalCategory). */
const GOAL_CATEGORIES: SeedRow[] = [
  { configKey: "goal_category", value: "buy_assess", label: "Assess a property (pre-purchase)", description: "Reconstruct a parcel's permit/complaint/inspection history before buying." },
  { configKey: "goal_category", value: "renovate", label: "Plan a remodel", description: "Baselines for timeline, cost, and review path for a planned project." },
  { configKey: "goal_category", value: "dispute", label: "Contractor dispute / evidence", description: "Build a paper trail: license-to-scope, abandoned addenda, stalled reviews." },
  { configKey: "goal_category", value: "inspector_vet", label: "Understand inspector culture", description: "Who inspects my area, and how do their results compare?" },
  { configKey: "goal_category", value: "contractor_vet", label: "Vet a contractor", description: "Permit track record, completion rate, complaint linkage." },
  { configKey: "goal_category", value: "neighborhood", label: "Neighborhood context", description: "Permit volume, costs, complaint hot-spots, review intensity by area." },
  { configKey: "goal_category", value: "compliance", label: "Compliance / open permits", description: "Open or expired permits, unpermitted work, NOV exposure on a parcel." },
  { configKey: "goal_category", value: "general", label: "General exploration", description: "Open-ended questions about the DBI data." },
];

/** Contractor/architect/engineer vetting roles (was hardcoded in VettingTool). */
const VETTING_ROLES: SeedRow[] = [
  "contractor",
  "architect",
  "structural engineer",
  "civil engineer",
  "roofer",
  "electrician",
  "hvac",
  "plumber",
  "HIS",
].map((r, i) => ({ configKey: "vetting_role", value: r, label: r, sortOrder: i }));

/** Permit trade-category badge colors. `building` = black bg / white text everywhere. */
const TRADE_CATEGORIES: SeedRow[] = [
  { configKey: "permit_trade_category", value: "building", label: "Building", color: "#0a0a0a", textColor: "#ffffff" },
  { configKey: "permit_trade_category", value: "electrical", label: "Electrical", color: "#f59e0b", textColor: "#0a0a0a" },
  { configKey: "permit_trade_category", value: "plumbing", label: "Plumbing", color: "#0ea5e9", textColor: "#0a0a0a" },
  { configKey: "permit_trade_category", value: "mechanical", label: "Mechanical", color: "#14b8a6", textColor: "#0a0a0a" },
  { configKey: "permit_trade_category", value: "grading", label: "Grading", color: "#a16207", textColor: "#ffffff" },
  { configKey: "permit_trade_category", value: "demolition", label: "Demolition", color: "#dc2626", textColor: "#ffffff" },
  { configKey: "permit_trade_category", value: "other", label: "Other", color: "#52525b", textColor: "#ffffff" },
];

/** Permit status badge colors (issued/complete green, in-review blue, hold amber, terminal red). */
const PERMIT_STATUSES: SeedRow[] = [
  { configKey: "permit_status", value: "complete", label: "Complete", color: "#16a34a", textColor: "#ffffff" },
  { configKey: "permit_status", value: "issued", label: "Issued", color: "#16a34a", textColor: "#ffffff" },
  { configKey: "permit_status", value: "approved", label: "Approved", color: "#16a34a", textColor: "#ffffff" },
  { configKey: "permit_status", value: "filed", label: "Filed", color: "#2563eb", textColor: "#ffffff" },
  { configKey: "permit_status", value: "reinstated", label: "Reinstated", color: "#2563eb", textColor: "#ffffff" },
  { configKey: "permit_status", value: "approved_otc", label: "Approved OTC", color: "#2563eb", textColor: "#ffffff" },
  { configKey: "permit_status", value: "suspend", label: "Suspended", color: "#d97706", textColor: "#ffffff" },
  { configKey: "permit_status", value: "withdrawn", label: "Withdrawn", color: "#dc2626", textColor: "#ffffff" },
  { configKey: "permit_status", value: "cancelled", label: "Cancelled", color: "#dc2626", textColor: "#ffffff" },
  { configKey: "permit_status", value: "expired", label: "Expired", color: "#dc2626", textColor: "#ffffff" },
];

/** SF neighborhood badge colors (starter set; Portola = purple, always. Admin adds the rest). */
const NEIGHBORHOODS: SeedRow[] = [
  { configKey: "sf_neighborhood", value: "Portola", label: "Portola", color: "#7c3aed", textColor: "#ffffff" },
  { configKey: "sf_neighborhood", value: "Mission", label: "Mission", color: "#dc2626", textColor: "#ffffff" },
  { configKey: "sf_neighborhood", value: "Noe Valley", label: "Noe Valley", color: "#16a34a", textColor: "#ffffff" },
  { configKey: "sf_neighborhood", value: "Sunset/Parkside", label: "Sunset/Parkside", color: "#0891b2", textColor: "#ffffff" },
  { configKey: "sf_neighborhood", value: "Tenderloin", label: "Tenderloin", color: "#b45309", textColor: "#ffffff" },
  { configKey: "sf_neighborhood", value: "Bernal Heights", label: "Bernal Heights", color: "#ca8a04", textColor: "#0a0a0a" },
  { configKey: "sf_neighborhood", value: "Bayview Hunters Point", label: "Bayview Hunters Point", color: "#0d9488", textColor: "#ffffff" },
  { configKey: "sf_neighborhood", value: "Outer Richmond", label: "Outer Richmond", color: "#4f46e5", textColor: "#ffffff" },
  { configKey: "sf_neighborhood", value: "Financial District/South Beach", label: "Financial District/South Beach", color: "#0369a1", textColor: "#ffffff" },
  { configKey: "sf_neighborhood", value: "Pacific Heights", label: "Pacific Heights", color: "#db2777", textColor: "#ffffff" },
  { configKey: "sf_neighborhood", value: "Marina", label: "Marina", color: "#e11d48", textColor: "#ffffff" },
  { configKey: "sf_neighborhood", value: "West of Twin Peaks", label: "West of Twin Peaks", color: "#65a30d", textColor: "#ffffff" },
];

/** All default config options, idempotently seeded. */
export const CONFIG_OPTION_DEFAULTS: SeedRow[] = [
  ...GOAL_CATEGORIES,
  ...VETTING_ROLES,
  ...TRADE_CATEGORIES,
  ...PERMIT_STATUSES,
  ...NEIGHBORHOODS,
];

/**
 * @fileoverview Frontend mirror of the DashboardSpec contract + storyteller API
 * response shapes consumed by the renderer and assistant.
 */

export type ChartFamily =
  | "area" | "area_stacked" | "area_step"
  | "bar" | "bar_horizontal" | "bar_grouped" | "bar_stacked" | "bar_labeled"
  | "line" | "line_multi" | "line_step"
  | "pie" | "donut" | "radar" | "radial" | "scatter"
  | "histogram" | "permit_lifecycle" | "ranked_bar";

export type BlockType =
  | "narrative" | "kpi_cards" | "chart" | "map" | "permits_table"
  | "gantt" | "timeline_steps" | "table" | "callout" | "custom";

export type QueryRef =
  | { mode: "named"; queryId: string; bind?: Record<string, string> }
  | { mode: "inline"; sql: string; bind?: Record<string, string> };

export interface FilterDecl {
  id: string;
  kind: "date_range" | "select" | "multiselect" | "geo_bbox" | "text" | "tags";
  label: string;
  param: string;
  options?: { value: string; label: string }[];
  default?: unknown;
}

export interface ChartEncoding {
  x?: string;
  y?: string | string[];
  series?: string;
  value?: string;
  stacked?: boolean;
  sort?: "asc" | "desc";
  valueLabels?: boolean;
  bins?: number;
  legend?: boolean;
  tooltip?: boolean;
}

export interface Block {
  id: string;
  type: BlockType;
  title?: string;
  span?: 1 | 2 | 3 | 4;
  query?: QueryRef;
  // narrative / callout
  markdown?: string;
  severity?: "info" | "warn" | "red_flag";
  actionRef?: string;
  // kpi
  cards?: { label: string; valueField: string; format?: "num" | "usd" | "days" | "pct"; deltaField?: string; intent?: "neutral" | "good" | "bad" }[];
  // chart
  chart?: ChartFamily;
  encoding?: ChartEncoding;
  // map
  map?: { render: "markers" | "clusters"; latField?: string; lngField?: string; weightField?: string; labelField?: string; tooltipFields?: string[] };
  // gantt / timeline
  eventLabelField?: string;
  startField?: string;
  endField?: string;
  categoryField?: string;
  stepLabelField?: string;
  dateField?: string;
  statusField?: string;
  // table
  columns?: { field: string; header: string; format?: string; sortable?: boolean }[];
  // custom
  render?: "vega" | "svg";
  workerRef?: string;
  prompt?: string;
}

export interface DashboardSpec {
  version: 1;
  title: string;
  subtitle?: string;
  goal_category?: string;
  filters: FilterDecl[];
  blocks: Block[];
}

export interface ThreadSummary {
  id: string;
  title: string;
  goalCategory: string | null;
  goalSummary: string | null;
  status: string;
  lastMessageAt: string | null;
}

export interface ThreadDetail {
  thread: ThreadSummary & Record<string, unknown>;
  messages: Record<string, unknown>[];
  latestPlan: Record<string, unknown> | null;
  liveSpec: { id: string; spec: DashboardSpec; version: number } | null;
  activeFilters: { filters: Record<string, unknown> } | null;
}

export interface RunBlockResponse {
  ok: boolean;
  rows: Record<string, unknown>[];
  metrics: Record<string, unknown>;
  errors: { message: string }[];
}

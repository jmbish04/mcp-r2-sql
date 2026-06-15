/**
 * @fileoverview Shared client-side event names + the set of agent tools whose
 * completion should trigger a dashboard reload. Keeping these in one module
 * avoids a circular import between StorytellerAssistant and StorytellerApp.
 */

export const STORYTELLER_EVENTS = {
  /** Fired after a dashboard-mutating agent tool completes. */
  refresh: "storyteller:refresh",
} as const;

/**
 * Agent tools that change the persisted dashboard / plan / filters. When any of
 * these complete in the assistant, the app reloads the thread detail.
 */
export const REFRESHING_TOOLS = new Set<string>([
  "save_data_plan",
  "propose_dashboard",
  "approve_dashboard",
  "update_dashboard_block",
  "set_filters",
  "set_goal",
]);

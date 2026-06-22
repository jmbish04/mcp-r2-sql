/**
 * @fileoverview `storyteller_messages` — conversation turns per thread
 * (assistant-ui history mirror + tool-call log).
 */

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const STORYTELLER_MESSAGES_TABLE_DESCRIPTION =
  "Conversation turns for a storyteller thread, including tool-call records.";

export const STORYTELLER_MESSAGES_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key.",
  thread_id: "FK -> storyteller_threads.id.",
  role: "user | assistant | system | tool.",
  content: "Message text (markdown/plain).",
  tool_calls: "JSON array of tool calls (name, args, result ref, status).",
  token_usage: "JSON token-usage record, if available.",
  created_at: "Unix ts.",
};

export const storytellerMessages = sqliteTable(
  "storyteller_messages",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    threadId: text("thread_id").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull().default(""),
    toolCalls: text("tool_calls", { mode: "json" }).$type<unknown[]>(),
    tokenUsage: text("token_usage", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [index("storyteller_messages_thread_idx").on(t.threadId, t.createdAt)],
);

export const insertStorytellerMessageSchema = createInsertSchema(storytellerMessages);
export const selectStorytellerMessageSchema = createSelectSchema(storytellerMessages);
export type StorytellerMessage = typeof storytellerMessages.$inferSelect;
export type NewStorytellerMessage = typeof storytellerMessages.$inferInsert;

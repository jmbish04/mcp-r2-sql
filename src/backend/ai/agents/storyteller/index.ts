/**
 * @fileoverview StorytellerAgent — the per-thread homeowner agent (AIChatAgent
 * Durable Object). One DO instance per thread (instance name = threadId);
 * persists its own assistant-ui history in embedded SQLite and drives the
 * goal→plan→approve→spec→render→edit workflow via the storyteller tools.
 *
 * Kept separate from ChatBroker so the workbench analytics chat is unaffected.
 */

import { AIChatAgent } from "@cloudflare/ai-chat";
import { convertToModelMessages, stepCountIs, streamText, type ToolSet, type UIMessage } from "ai";

import { getChatModel } from "@/backend/ai/providers/ai-sdk";
import { buildStorytellerTools } from "./tools";
import { storytellerSystemPrompt } from "./prompt";

export { buildStorytellerTools } from "./tools";
export { storytellerSystemPrompt } from "./prompt";

export class StorytellerAgent extends AIChatAgent<Env> {
  static docsMetadata() {
    return {
      name: "StorytellerAgent",
      className: "StorytellerAgent",
      description:
        "Per-thread SF-homeowner agent: interviews the user, records an evolving data plan, and renders a bespoke dashboard spec (goal→plan→approve→spec→edit). One DO instance per thread.",
      docsPath: "/docs/agents/storyteller",
      methods: [
        { name: "onChatMessage", description: "Streams a reply + drives the storyteller tool workflow for the thread.", params: "onFinish", returns: "Response (streamed)" },
      ],
    };
  }

  async onChatMessage(onFinish: Parameters<AIChatAgent<Env>["onChatMessage"]>[0]) {
    // The DO instance name is the storyteller thread id.
    const threadId = this.name;
    const result = streamText({
      model: getChatModel(this.env),
      system: storytellerSystemPrompt(),
      messages: await convertToModelMessages(this.messages as UIMessage[]),
      tools: buildStorytellerTools(this.env, threadId) as ToolSet,
      stopWhen: stepCountIs(10),
      onFinish,
    });
    return result.toUIMessageStreamResponse();
  }
}

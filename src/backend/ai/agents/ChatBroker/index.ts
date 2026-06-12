/**
 * @fileoverview ChatBroker - State-persistent Durable Object chat broker.
 *
 * Hosts assistant-ui `<Thread />` conversations over a Cloudflare Agents SDK
 * WebSocket channel, bypassing external provider middleware. Each instance is
 * keyed by a session id (`idFromName`) and persists its message history in
 * the embedded SQLite store managed by AIChatAgent.
 *
 * Frontend pairing: `useAgentChat({ agent: "chat-broker", name: sessionId })`
 * from `agents/react`, rendered through `@assistant-ui/react` primitives.
 */

import { AIChatAgent } from "@cloudflare/ai-chat";
import { convertToModelMessages, stepCountIs, streamText, type ToolSet, type UIMessage } from "ai";

import { analyticsSystemPrompt, buildAnalyticsTools } from "@/backend/ai/agents/analytics";
import { getChatModel } from "@/backend/ai/providers/ai-sdk";

export class ChatBroker extends AIChatAgent<Env> {
  static docsMetadata() {
    return {
      name: "ChatBroker",
      className: "ChatBroker",
      description:
        "WebSocket-native chat broker for assistant-ui `<Thread />`. Persists conversation state per session in embedded SQLite. Routes inference through the project's Workers AI provider registry.",
      docsPath: "/docs/agents/chat-broker",
      methods: [
        {
          name: "onChatMessage",
          description:
            "Streams an LLM reply for the latest user turn. Persists assistant output to the embedded conversation log on finish.",
          params: "onFinish: (result) => void",
          returns: "Response (streamed)",
        },
      ],
    };
  }

  async onChatMessage(onFinish: Parameters<AIChatAgent<Env>["onChatMessage"]>[0]) {
    const result = streamText({
      model: getChatModel(this.env),
      system: analyticsSystemPrompt(),
      messages: await convertToModelMessages(this.messages as UIMessage[]),
      // Analytics toolkit: run_query / nl_to_sql / describe_schema /
      // interpret_results / detect_anomalies / suggest_queries /
      // lookup_permits / vet_contractor — all guard-enforced server-side.
      // Cast to ToolSet: AIChatAgent's onFinish is typed against the generic
      // ToolSet, which is structurally incompatible with the inferred
      // specific tool map (same pattern as the Cloudflare agents starter).
      tools: buildAnalyticsTools(this.env) as ToolSet,
      stopWhen: stepCountIs(8),
      onFinish,
    });

    return result.toUIMessageStreamResponse();
  }
}

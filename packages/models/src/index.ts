import type { Agent } from "@ai-battle/engine";
import { llmAgent } from "./llm.js";
import { mockAgent } from "./mock.js";
import { anthropicClient, googleClient, openaiClient } from "./providers.js";

export { mockAgent } from "./mock.js";
export { llmAgent, type ChatClient } from "./llm.js";
export { openaiClient, anthropicClient, googleClient } from "./providers.js";

/**
 * Build an agent from a short spec string:
 *   "mock"                       -> random-legal baseline
 *   "openai:gpt-5"               -> OpenAI model
 *   "anthropic:claude-opus-4-8"  -> Anthropic model
 *   "google:gemini-2.5-pro"      -> Google model
 *
 * `displayName` is the in-game seat name shown to other players (e.g. "Alice").
 */
export function agentFromSpec(spec: string, displayName?: string): Agent {
  const [provider, model] = spec.split(":");
  const label = displayName ?? spec;
  switch (provider) {
    case "mock":
      return mockAgent(label);
    case "openai":
      return llmAgent(openaiClient(model), label);
    case "anthropic":
      return llmAgent(anthropicClient(model), label);
    case "google":
      return llmAgent(googleClient(model), label);
    default:
      throw new Error(`Unknown model provider "${provider}" in spec "${spec}"`);
  }
}

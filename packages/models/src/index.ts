import type { Agent } from "@ai-battle/engine";
import { llmAgent } from "./llm.js";
import { mockAgent } from "./mock.js";
import {
  anthropicClient,
  googleClient,
  groqClient,
  ollamaClient,
  openaiClient,
  openrouterClient,
} from "./providers.js";

export { mockAgent } from "./mock.js";
export { llmAgent, type ChatClient } from "./llm.js";
export {
  openaiClient,
  anthropicClient,
  googleClient,
  groqClient,
  openrouterClient,
  ollamaClient,
} from "./providers.js";

/**
 * Build an agent from a short `provider:model` spec. The model part may itself
 * contain colons/slashes (e.g. OpenRouter ids), so we split on the FIRST colon.
 *
 *   "mock"                                     -> random-legal baseline (free)
 *   "google:gemini-2.5-flash"                  -> Google (has a free tier)
 *   "groq:llama-3.3-70b-versatile"             -> Groq (free tier)
 *   "openrouter:meta-llama/llama-3.3-70b-instruct:free" -> OpenRouter free model
 *   "ollama:llama3.1"                          -> local model ($0, needs Ollama)
 *   "openai:gpt-5-mini"                        -> OpenAI (paid)
 *   "anthropic:claude-haiku-4-5"               -> Anthropic (paid)
 *
 * `displayName` is the in-game seat name shown to other players (e.g. "Alice").
 */
export function agentFromSpec(spec: string, displayName?: string): Agent {
  const idx = spec.indexOf(":");
  const provider = idx === -1 ? spec : spec.slice(0, idx);
  const model = idx === -1 ? undefined : spec.slice(idx + 1);
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
    case "groq":
      return llmAgent(groqClient(model), label);
    case "openrouter":
      return llmAgent(openrouterClient(model), label);
    case "ollama":
      return llmAgent(ollamaClient(model), label);
    default:
      throw new Error(`Unknown model provider "${provider}" in spec "${spec}"`);
  }
}

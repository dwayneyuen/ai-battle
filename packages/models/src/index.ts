import type { Agent } from "@ai-battle/engine";
import { clientFromSpec } from "./clients";
import { llmAgent } from "./llm";
import { mockAgent } from "./mock";

export { mockAgent, mockChatClient } from "./mock";
export { llmAgent, type ChatClient } from "./llm";
export { clientFromSpec } from "./clients";
export { pdStrategy, pdStrategyFromSpec } from "./pd";
export {
  rollOffAgent,
  mockRollOffAgent,
  rollOffAgentFromSpec,
} from "./rolloff";
export {
  SeasonAgent,
  type DeclareResult,
  type GenerationReflection,
  type OwnMatchLog,
  type StandingLine,
} from "./pd-season";
export {
  openaiClient,
  anthropicClient,
  googleClient,
  groqClient,
  openrouterClient,
  ollamaClient,
  xaiClient,
  deepseekClient,
  mistralClient,
  togetherClient,
} from "./providers";

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
  const label = displayName ?? spec;
  if (spec === "mock" || spec.startsWith("mock:")) return mockAgent(label);
  return llmAgent(clientFromSpec(spec), label);
}

import type { ChatClient } from "./llm.js";
import {
  anthropicClient,
  deepseekClient,
  googleClient,
  groqClient,
  mistralClient,
  ollamaClient,
  openaiClient,
  openrouterClient,
  togetherClient,
  xaiClient,
} from "./providers.js";

/**
 * Build a {@link ChatClient} from a short `provider:model` spec. The model part
 * may itself contain colons/slashes (e.g. OpenRouter ids), so we split on the
 * FIRST colon only.
 *
 *   "google:gemini-2.5-flash"
 *   "groq:llama-3.3-70b-versatile"
 *   "openrouter:meta-llama/llama-3.3-70b-instruct:free"
 *   "openai:gpt-5-mini"
 *
 * "mock" has no chat client — callers handle that pseudo-provider themselves.
 */
export function clientFromSpec(spec: string): ChatClient {
  const idx = spec.indexOf(":");
  const provider = idx === -1 ? spec : spec.slice(0, idx);
  const model = idx === -1 ? undefined : spec.slice(idx + 1);
  switch (provider) {
    case "openai":
      return openaiClient(model);
    case "anthropic":
      return anthropicClient(model);
    case "google":
      return googleClient(model);
    case "groq":
      return groqClient(model);
    case "openrouter":
      return openrouterClient(model);
    case "ollama":
      return ollamaClient(model);
    case "xai":
      return xaiClient(model);
    case "deepseek":
      return deepseekClient(model);
    case "mistral":
      return mistralClient(model);
    case "together":
      return togetherClient(model);
    case "mock":
      throw new Error(
        `"mock" has no chat client; handle it in the caller (e.g. a random baseline).`,
      );
    default:
      throw new Error(`Unknown model provider "${provider}" in spec "${spec}"`);
  }
}

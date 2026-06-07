import type { ChatClient } from "./llm";

/**
 * Provider adapters. The SDKs are imported lazily (and via an indirect
 * specifier so TypeScript doesn't require them at build time) — the package
 * installs and the mock demo runs even if these SDKs aren't present. Install
 * them only when you want real models:
 *
 *   pnpm add openai @anthropic-ai/sdk @google/genai -w
 */

async function lazyImport(pkg: string): Promise<any> {
  try {
    const specifier = pkg; // indirect so tsc doesn't try to resolve types
    return await import(specifier);
  } catch {
    throw new Error(
      `The "${pkg}" SDK isn't installed. Run: pnpm add ${pkg} -w`,
    );
  }
}

interface OpenAICompatOptions {
  label: string;
  apiKey?: string;
  /** Override for OpenAI-compatible gateways (Groq, OpenRouter, Ollama, ...). */
  baseURL?: string;
  /** Friendly name of the env var that holds the key, for error messages. */
  keyEnv?: string;
  /** Max tokens to generate. Mafia replies are short, so keep this small. */
  maxTokens?: number;
}

/**
 * One client for OpenAI and every OpenAI-compatible endpoint. We ask for JSON
 * via response_format, but some gateways/models reject that param — so on
 * failure we retry once without it and lean on the prompt + tolerant parser.
 */
function openAICompatibleClient(
  model: string,
  opts: OpenAICompatOptions,
): ChatClient {
  const { label, apiKey, baseURL, keyEnv, maxTokens = 400 } = opts;
  let clientPromise: Promise<any> | null = null;
  // A literal import (openai is a hard dependency) so bundlers can resolve it,
  // unlike the lazy variable-specifier import used for the optional SDKs.
  const get = () =>
    (clientPromise ??= import("openai").then(
      (m: any) => new m.default({ apiKey, baseURL }),
    ));
  return {
    label: `${label}:${model}`,
    async complete(system, user) {
      if (!apiKey) throw new Error(`${keyEnv ?? "API key"} is not set`);
      const client = await get();
      const base = {
        model,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      };
      try {
        const res = await client.chat.completions.create({
          ...base,
          response_format: { type: "json_object" },
        });
        return res.choices[0]?.message?.content ?? "";
      } catch {
        const res = await client.chat.completions.create(base);
        return res.choices[0]?.message?.content ?? "";
      }
    },
  };
}

export function openaiClient(
  model = "gpt-5-mini",
  apiKey = process.env.OPENAI_API_KEY,
): ChatClient {
  return openAICompatibleClient(model, {
    label: "openai",
    apiKey,
    keyEnv: "OPENAI_API_KEY",
  });
}

/** Groq — fast, generous free tier, runs open models. https://console.groq.com */
export function groqClient(
  model = "llama-3.3-70b-versatile",
  apiKey = process.env.GROQ_API_KEY,
): ChatClient {
  return openAICompatibleClient(model, {
    label: "groq",
    apiKey,
    keyEnv: "GROQ_API_KEY",
    baseURL: "https://api.groq.com/openai/v1",
  });
}

/** OpenRouter — one key, many models (several free). https://openrouter.ai */
export function openrouterClient(
  model = "meta-llama/llama-3.3-70b-instruct:free",
  apiKey = process.env.OPENROUTER_API_KEY,
): ChatClient {
  return openAICompatibleClient(model, {
    label: "openrouter",
    apiKey,
    keyEnv: "OPENROUTER_API_KEY",
    baseURL: "https://openrouter.ai/api/v1",
  });
}

/** Ollama — run models locally for $0. https://ollama.com (start: `ollama serve`) */
export function ollamaClient(
  model = "llama3.1",
  baseURL = process.env.OLLAMA_HOST ?? "http://localhost:11434/v1",
): ChatClient {
  // Ollama ignores the key but the OpenAI SDK requires a non-empty string.
  return openAICompatibleClient(model, {
    label: "ollama",
    apiKey: "ollama",
    baseURL,
  });
}

/** xAI Grok. https://console.x.ai */
export function xaiClient(
  model = "grok-3",
  apiKey = process.env.XAI_API_KEY,
): ChatClient {
  return openAICompatibleClient(model, {
    label: "xai",
    apiKey,
    keyEnv: "XAI_API_KEY",
    baseURL: "https://api.x.ai/v1",
  });
}

/** DeepSeek — very cheap, strong reasoning. https://platform.deepseek.com */
export function deepseekClient(
  model = "deepseek-chat",
  apiKey = process.env.DEEPSEEK_API_KEY,
): ChatClient {
  return openAICompatibleClient(model, {
    label: "deepseek",
    apiKey,
    keyEnv: "DEEPSEEK_API_KEY",
    baseURL: "https://api.deepseek.com",
  });
}

/** Mistral. https://console.mistral.ai */
export function mistralClient(
  model = "mistral-large-latest",
  apiKey = process.env.MISTRAL_API_KEY,
): ChatClient {
  return openAICompatibleClient(model, {
    label: "mistral",
    apiKey,
    keyEnv: "MISTRAL_API_KEY",
    baseURL: "https://api.mistral.ai/v1",
  });
}

/** Together AI — hosts many open models (Llama, Qwen, ...). https://together.ai */
export function togetherClient(
  model = "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  apiKey = process.env.TOGETHER_API_KEY,
): ChatClient {
  return openAICompatibleClient(model, {
    label: "together",
    apiKey,
    keyEnv: "TOGETHER_API_KEY",
    baseURL: "https://api.together.xyz/v1",
  });
}

export function anthropicClient(
  model = "claude-opus-4-8",
  apiKey = process.env.ANTHROPIC_API_KEY,
): ChatClient {
  let clientPromise: Promise<any> | null = null;
  const get = () =>
    (clientPromise ??= lazyImport("@anthropic-ai/sdk").then(
      (m) => new m.default({ apiKey }),
    ));
  return {
    label: `anthropic:${model}`,
    async complete(system, user) {
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
      const client = await get();
      const res = await client.messages.create({
        model,
        max_tokens: 400,
        system: `${system}\n\nAlways respond with a single valid JSON object and nothing else.`,
        messages: [{ role: "user", content: user }],
      });
      const block = res.content?.find((b: any) => b.type === "text");
      return block?.text ?? "";
    },
  };
}

export function googleClient(
  model = "gemini-2.5-pro",
  apiKey = process.env.GOOGLE_API_KEY,
): ChatClient {
  let clientPromise: Promise<any> | null = null;
  const get = () =>
    (clientPromise ??= lazyImport("@google/genai").then(
      (m) => new m.GoogleGenAI({ apiKey }),
    ));
  return {
    label: `google:${model}`,
    async complete(system, user) {
      if (!apiKey) throw new Error("GOOGLE_API_KEY is not set");
      const client = await get();
      const res = await client.models.generateContent({
        model,
        contents: `${system}\n\n${user}`,
        config: { responseMimeType: "application/json" },
      });
      return res.text ?? "";
    },
  };
}

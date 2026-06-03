import type { ChatClient } from "./llm.js";

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

export function openaiClient(
  model = "gpt-5",
  apiKey = process.env.OPENAI_API_KEY,
): ChatClient {
  let clientPromise: Promise<any> | null = null;
  const get = () =>
    (clientPromise ??= lazyImport("openai").then(
      (m) => new m.default({ apiKey }),
    ));
  return {
    label: `openai:${model}`,
    async complete(system, user) {
      if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
      const client = await get();
      const res = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      });
      return res.choices[0]?.message?.content ?? "";
    },
  };
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
        max_tokens: 1024,
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

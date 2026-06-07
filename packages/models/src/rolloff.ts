import {
  TransportError,
  type RollOffAgent,
  type RollOffContext,
} from "@ai-battle/engine";
import { clientFromSpec } from "./clients";
import type { ChatClient } from "./llm";

const RULES = `You are playing Roll-Off, a pure-luck dice race against other players.
Each round you predict your next die roll — an integer from 1 to 6. Your prediction
does NOT change the roll (the dealer rolls a fair die); it's just a guess. First
player to reach the target score wins. Just pick a number 1-6.`;

function buildPrompt(ctx: RollOffContext): string {
  const scores = ctx.scores.map((s) => `- ${s.name}: ${s.score}`).join("\n");
  return `You are ${ctx.you}. Round ${ctx.round}. Target: ${ctx.target}. Your score: ${ctx.yourScore}.

Scores:
${scores}

${ctx.prompt}
Respond ONLY with JSON: {"prediction": <integer 1-6>, "thoughts": "<brief>"}`;
}

function parsePrediction(raw: string): {
  prediction?: number;
  thoughts?: string;
} {
  const text = raw.replace(/```json\s*|\s*```/g, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try {
      const obj = JSON.parse(text.slice(start, end + 1));
      const n = Number(obj.prediction);
      return {
        prediction: Number.isFinite(n) ? n : undefined,
        thoughts: typeof obj.thoughts === "string" ? obj.thoughts : undefined,
      };
    } catch {
      // fall through to a looser match
    }
  }
  const m = text.match(/[1-6]/);
  return { prediction: m ? Number(m[0]) : undefined };
}

/** Wrap any ChatClient as a Roll-Off agent. */
export function rollOffAgent(client: ChatClient, name?: string): RollOffAgent {
  return {
    name: name ?? client.label,
    async decide(ctx) {
      const system = RULES;
      const user = buildPrompt(ctx);
      const t0 = Date.now();
      let raw: string;
      try {
        raw = await client.complete(system, user);
      } catch (err) {
        throw new TransportError(
          `${client.label} call failed: ${(err as Error).message}`,
        );
      }
      const latencyMs = Date.now() - t0;
      const { prediction, thoughts } = parsePrediction(raw);
      return {
        prediction,
        thoughts,
        diagnostics: { system, user, raw, latencyMs },
      };
    },
  };
}

/** A free, always-valid Roll-Off player (predicts a random 1-6). No model call. */
export function mockRollOffAgent(name: string): RollOffAgent {
  return {
    name,
    async decide() {
      return { prediction: 1 + Math.floor(Math.random() * 6) };
    },
  };
}

/** Build a Roll-Off agent from a `provider:model` spec (or "mock"). */
export function rollOffAgentFromSpec(
  spec: string,
  name?: string,
): RollOffAgent {
  if (spec === "mock" || spec.startsWith("mock:")) {
    return mockRollOffAgent(name ?? "mock");
  }
  return rollOffAgent(clientFromSpec(spec), name);
}

import type { Move, MoveContext, Strategy } from "@ai-battle/engine";
import { clientFromSpec } from "./clients.js";
import type { ChatClient } from "./llm.js";

const RULES = `You are playing the Iterated Prisoner's Dilemma against one opponent over a
fixed number of rounds. Each round you both choose simultaneously to COOPERATE (C)
or DEFECT (D). Scoring per round (your points): both C = 3; you D while they C = 5;
you C while they D = 0; both D = 1. Your goal is to maximize YOUR OWN total points
across all rounds. Think about reputation, retaliation, and forgiveness.`;

function buildPrompt(ctx: MoveContext): string {
  const history = ctx.myMoves.length
    ? ctx.myMoves
        .map(
          (m, i) =>
            `  Round ${i + 1}: you played ${m}, opponent played ${ctx.oppMoves[i]}`,
        )
        .join("\n")
    : "  (no rounds played yet — this is the first round)";

  return `This match is ${ctx.rounds} rounds total. You are about to play round ${
    ctx.round + 1
  } of ${ctx.rounds}.

History so far:
${history}

Choose your move for this round.
Respond ONLY with JSON: {"move": "C" or "D", "reasoning": "<brief>"}`;
}

/** Tolerantly extract C/D from a model response. */
function parseMove(raw: string): Move | undefined {
  const text = raw.replace(/```json\s*|\s*```/g, "");
  const m = text.match(/"move"\s*:\s*"?\s*([CD])/i);
  if (m) return m[1].toUpperCase() === "D" ? "D" : "C";
  if (/\bdefect\b/i.test(text)) return "D";
  if (/\bcooperate\b/i.test(text)) return "C";
  return undefined;
}

/** Wrap any ChatClient as a Prisoner's Dilemma strategy. Defaults to C on failure. */
export function pdStrategy(client: ChatClient, name?: string): Strategy {
  return {
    name: name ?? client.label,
    description: `LLM player (${client.label})`,
    async next(ctx) {
      try {
        const raw = await client.complete(RULES, buildPrompt(ctx));
        return parseMove(raw) ?? "C";
      } catch {
        return "C";
      }
    },
  };
}

/** Build a PD strategy directly from a `provider:model` spec. */
export function pdStrategyFromSpec(spec: string, name?: string): Strategy {
  return pdStrategy(clientFromSpec(spec), name);
}

import { mulberry32, pick, type Agent } from "@ai-battle/engine";
import type { ChatClient } from "./llm";

const FLAVOR = [
  "I'm not sure yet, but {p} has been awfully quiet.",
  "I trust the town to make the right call. I'm clearly not mafia.",
  "Something about {p}'s reasoning doesn't add up to me.",
  "Let's not rush. We can't afford to lose another townsperson.",
  "I'll throw my support behind whoever has the strongest case against {p}.",
  "Honestly, I have nothing to hide. Look at how {p} is deflecting.",
];

/**
 * A zero-cost agent that plays legally at random. Lets the whole pipeline run
 * with no API keys, and is a useful baseline opponent for real models. It
 * always returns a valid, in-bounds response, so it never forfeits.
 */
export function mockAgent(
  name: string,
  seed = (Math.random() * 2 ** 32) >>> 0,
): Agent {
  const rand = mulberry32(seed);
  return {
    name,
    async decide(ctx) {
      const others = ctx.players.filter((p) => p.alive && p.id !== ctx.you.id);
      if (ctx.decision.type === "bid") {
        // Bid 0..maxUrgency, skewed so the room sometimes falls silent.
        const max = ctx.decision.maxUrgency ?? 3;
        return { urgency: Math.floor(rand() * (max + 1)) };
      }
      if (ctx.decision.type === "statement") {
        const who = others.length ? pick(others, rand).name : "someone";
        return { text: pick(FLAVOR, rand).replaceAll("{p}", who) };
      }
      const target =
        ctx.decision.options.length > 0
          ? pick(ctx.decision.options, rand)
          : undefined;
      return { target, thoughts: "(mock) picking at random" };
    },
  };
}

/**
 * A zero-cost {@link ChatClient} for the Prisoner's Dilemma season. It returns
 * well-formed JSON for whichever prompt shape it's handed (a move, an initial
 * declaration, a per-match reflection, or a between-generation revision), so the
 * whole season pipeline — including the three levels of captured reasoning —
 * runs with no API keys. Moves are coin-flips; the text is canned placeholder.
 */
export function mockChatClient(
  label: string,
  seed = (Math.random() * 2 ** 32) >>> 0,
): ChatClient {
  const rand = mulberry32(seed);
  return {
    label,
    async complete(_system, user) {
      const move = rand() < 0.5 ? "C" : "D";
      // Between-generation revision asks for both a strategy and a notebook.
      if (/"notebook"/.test(user)) {
        return JSON.stringify({
          strategy: "(mock) keep cooperating, but punish repeat defectors.",
          notebook: "(mock) some opponents defect early; watch the last round.",
          thoughts: "(mock) adjusting after reviewing my round-robin results.",
        });
      }
      if (/"move"/.test(user)) {
        return JSON.stringify({
          move,
          thoughts: "(mock) coin-flip this round.",
        });
      }
      // Initial declaration asks for a strategy (but no notebook).
      if (/"strategy"/.test(user)) {
        return JSON.stringify({
          strategy: "(mock) open by cooperating, then mirror the opponent.",
          thoughts: "(mock) a nice, retaliatory opening plan.",
        });
      }
      // Otherwise a per-match reflection: thoughts only.
      return JSON.stringify({
        thoughts: "(mock) that match went about as I expected.",
      });
    },
  };
}

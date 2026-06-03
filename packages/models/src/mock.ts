import { mulberry32, pick, type Agent } from "@ai-battle/engine";

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
 * with no API keys, and is a useful baseline opponent for real models.
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
      if (ctx.decision.type === "statement") {
        const who = others.length ? pick(others, rand).name : "someone";
        return { text: pick(FLAVOR, rand).replaceAll("{p}", who) };
      }
      const target =
        ctx.decision.options.length > 0
          ? pick(ctx.decision.options, rand)
          : undefined;
      return { target, reasoning: "(mock) picking at random" };
    },
  };
}

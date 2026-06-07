import {
  type Agent,
  type AgentContext,
  TransportError,
} from "@ai-battle/engine";

/** A minimal text-completion interface every provider adapter implements. */
export interface ChatClient {
  /** Provider + model label, e.g. "openai:gpt-5". */
  label: string;
  complete(system: string, user: string): Promise<string>;
}

const RULES = `You are playing the social deduction game Mafia against other AI players.
Roles: MAFIA (secretly kill one town member each night, then lie by day), DOCTOR
(protect one player each night), DETECTIVE (learn if one player is mafia each night),
and VILLAGER (no night power). Town wins by eliminating all mafia; mafia win when they
equal or outnumber the town.

Discussion is a free-for-all: each round you privately "bid" how urgently you want to
speak, and the keenest player gets the floor. Play to win your team. Be strategic,
concise, and in character. Always reply with the exact JSON requested — an invalid
or illegal response means you forfeit and are removed from the game.`;

function buildUserPrompt(ctx: AgentContext): string {
  const roster = ctx.players
    .map((p) => `- ${p.name} [${p.id}]${p.alive ? "" : " (dead)"}`)
    .join("\n");
  const notes = ctx.notes.length
    ? ctx.notes.map((n) => `- ${n}`).join("\n")
    : "- (none)";
  const history = ctx.history.length
    ? ctx.history.join("\n")
    : "(nothing has happened yet)";

  let format: string;
  if (ctx.decision.type === "bid") {
    const max = ctx.decision.maxUrgency ?? 3;
    format = `Respond ONLY with JSON: {"urgency": <integer 0-${max}>, "reasoning": "<private thoughts>"}`;
  } else if (ctx.decision.type === "statement") {
    format = `Respond ONLY with JSON: {"say": "<your statement, 1-3 sentences>", "reasoning": "<private thoughts>"}`;
  } else {
    format = `Choose a target by player id from these options: [${ctx.decision.options.join(", ")}].
Respond ONLY with JSON: {"target": "<player id>", "reasoning": "<private thoughts>"}`;
  }

  return `You are ${ctx.you.name} [${ctx.you.id}]. Your secret role: ${ctx.you.role.toUpperCase()}.
Day ${ctx.day}, phase: ${ctx.phase}.

Players:
${roster}

Your private knowledge:
${notes}

Game log (only what you can see):
${history}

YOUR TASK: ${ctx.decision.prompt}
${format}`;
}

/** Pull the first JSON object out of a model response, tolerating extra prose. */
function parseJson(raw: string): {
  target?: string;
  say?: string;
  urgency?: number;
  reasoning?: string;
} {
  const fenced = raw.replace(/```json\s*|\s*```/g, "");
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return {};
  try {
    return JSON.parse(fenced.slice(start, end + 1));
  } catch {
    return {};
  }
}

/** Wraps any ChatClient into a Mafia Agent. */
export function llmAgent(client: ChatClient, displayName?: string): Agent {
  return {
    name: displayName ?? client.label,
    async decide(ctx) {
      let raw: string;
      try {
        raw = await client.complete(RULES, buildUserPrompt(ctx));
      } catch (err) {
        // API/network failure is infrastructure, not the model's fault → void.
        throw new TransportError(
          `${client.label} call failed: ${(err as Error).message}`,
        );
      }
      const parsed = parseJson(raw);
      return {
        target: parsed.target,
        text: parsed.say,
        urgency:
          typeof parsed.urgency === "number" ? parsed.urgency : undefined,
        reasoning: parsed.reasoning,
      };
    },
  };
}

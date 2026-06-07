import type { Move, MoveContext, Strategy } from "@ai-battle/engine";
import { clientFromSpec } from "./clients.js";
import type { ChatClient } from "./llm.js";
import { mockChatClient } from "./mock.js";

/**
 * The "season" framing of the Iterated Prisoner's Dilemma, where the interesting
 * object of study is not the strategy but how a model *reasons over time*: it
 * declares a strategy, plays a round robin against every other model, reflects
 * on its own results, and revises — across several generations.
 *
 * A {@link SeasonAgent} is therefore stateful (unlike the pure classic
 * strategies): it carries a private STRATEGY (its current plan) and a private
 * NOTEBOOK (lessons learned), both visible only to itself. Reasoning is captured
 * at three levels — per round, per match, and per generation — which is the data
 * the experiment is really after.
 */

/** Shared rules describing the whole season meta-game. */
const SEASON_RULES = `You are competing in a SEASON of the Iterated Prisoner's Dilemma against several other AI players.

- The season runs several ROUND ROBINS (called "generations"). In each generation you play one MATCH against every other player.
- Each match is a fixed number of rounds. Each round, both players choose SIMULTANEOUSLY to COOPERATE (C) or DEFECT (D); neither sees the other's choice for that round until it is locked in.
- Per-round scoring (YOUR points): both C = 3; you D while they C = 5; you C while they D = 0; both D = 1.
- Your goal is to maximize YOUR OWN total points across the entire season.
- You CANNOT communicate with opponents. The only thing you may study between generations is the results of YOUR OWN past matches.
- You keep a private STRATEGY (your current plan) and a private NOTEBOOK (lessons learned). Both carry forward across generations and are visible only to you.

Think carefully about reputation, retaliation, forgiveness, and the fixed-length horizon. Always respond with exactly the JSON requested and nothing else.`;

/** Result of declaring (or revising to) a strategy. */
export interface DeclareResult {
  strategy: string;
  thoughts: string;
}

/** Result of a between-generation revision: a new plan, rewritten notes, and why. */
export interface GenerationReflection {
  strategy: string;
  notebook: string;
  thoughts: string;
}

/** A compact, model-facing summary of one of the agent's own finished matches. */
export interface OwnMatchLog {
  opponent: string;
  /** Round-by-round, from this agent's point of view. */
  rounds: { mine: Move; theirs: Move }[];
  myScore: number;
  oppScore: number;
}

/** A row of the running season standings, shown to the agent when it reflects. */
export interface StandingLine {
  label: string;
  total: number;
}

/** Pull the first JSON object out of a model response, tolerating extra prose. */
function parseJson(raw: string): {
  move?: string;
  strategy?: string;
  notebook?: string;
  thoughts?: string;
} {
  const fenced = raw.replace(/```json\s*|\s*```/g, "");
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(fenced.slice(start, end + 1));
    } catch {
      /* fall through to a looser scan */
    }
  }
  return {};
}

/** Tolerantly extract a move from a response, defaulting to Cooperate. */
function coerceMove(raw: string, parsedMove?: string): Move {
  if (parsedMove)
    return parsedMove.trim().toUpperCase().startsWith("D") ? "D" : "C";
  if (/\bdefect\b/i.test(raw)) return "D";
  return "C";
}

/** Render one match from the agent's point of view, e.g. "C-D C-C D-D". */
function renderRounds(rounds: { mine: Move; theirs: Move }[]): string {
  return rounds.length
    ? rounds.map((r) => `${r.mine}-${r.theirs}`).join(" ")
    : "(no rounds)";
}

/** Build the {@link ChatClient} for a season seat: a mock for "mock", else a real provider. */
function clientForSeat(spec: string): ChatClient {
  if (spec === "mock" || spec.startsWith("mock:")) return mockChatClient(spec);
  return clientFromSpec(spec);
}

/**
 * A stateful Prisoner's Dilemma player for the season format. Holds the model's
 * current declared strategy and notebook, plays rounds with captured reasoning,
 * and revises between generations from its own match history (raw logs) plus its
 * notebook.
 */
export class SeasonAgent {
  readonly spec: string;
  readonly label: string;
  private readonly client: ChatClient;

  /** The agent's current plan (set by declareInitial / reflectOnGeneration). */
  declaredStrategy = "";
  /** The agent's running private notes (rewritten each generation). */
  notebook = "";

  constructor(spec: string, label?: string) {
    this.spec = spec;
    this.client = clientForSeat(spec);
    this.label = label ?? this.client.label;
  }

  /** Declare an opening strategy before the first round robin. Sets {@link declaredStrategy}. */
  async declareInitial(
    rounds: number,
    opponents: string[],
  ): Promise<DeclareResult> {
    const user = `The season is about to begin. Players (including you): ${[
      this.label,
      ...opponents,
    ].join(", ")}.
Each match is ${rounds} rounds. Declare your OPENING strategy for the first round robin.

Respond ONLY with JSON: {"strategy": "<your plan, a few sentences>", "thoughts": "<your reasoning>"}`;
    try {
      const parsed = parseJson(await this.client.complete(SEASON_RULES, user));
      const strategy =
        parsed.strategy?.trim() || "Cooperate first, then mirror the opponent.";
      this.declaredStrategy = strategy;
      return { strategy, thoughts: parsed.thoughts?.trim() ?? "" };
    } catch {
      this.declaredStrategy = "Cooperate first, then mirror the opponent.";
      return {
        strategy: this.declaredStrategy,
        thoughts: "(no reasoning captured)",
      };
    }
  }

  /**
   * A {@link Strategy} that plays one match against `opponent` in generation
   * `gen`, asking the model for a move + per-round thoughts each round, guided by
   * the agent's current strategy and notebook. Defaults to Cooperate on failure.
   */
  strategyForMatch(opponent: string, gen: number): Strategy {
    return {
      name: this.label,
      description: `LLM season player (${this.client.label})`,
      next: async (ctx: MoveContext) => {
        const user = this.buildMovePrompt(ctx, opponent, gen);
        try {
          const raw = await this.client.complete(SEASON_RULES, user);
          const parsed = parseJson(raw);
          return {
            move: coerceMove(raw, parsed.move),
            thoughts: parsed.thoughts?.trim(),
          };
        } catch {
          return {
            move: "C" as Move,
            thoughts: "(model call failed; defaulted to C)",
          };
        }
      },
    };
  }

  private buildMovePrompt(
    ctx: MoveContext,
    opponent: string,
    gen: number,
  ): string {
    const history = ctx.myMoves.length
      ? ctx.myMoves
          .map(
            (m, i) =>
              `  Round ${i + 1}: you played ${m}, ${opponent} played ${ctx.oppMoves[i]}`,
          )
          .join("\n")
      : "  (no rounds yet — this is the first round)";

    return `Generation ${gen}. You are playing a match against ${opponent}.
This match is ${ctx.rounds} rounds; you are about to play round ${ctx.round + 1} of ${ctx.rounds}.

YOUR CURRENT STRATEGY:
${this.declaredStrategy || "(none declared yet)"}

YOUR NOTEBOOK:
${this.notebook || "(empty)"}

This match so far:
${history}

Choose your move for this round — follow your strategy, or deliberately deviate if you judge it better.
Respond ONLY with JSON: {"move": "C" or "D", "thoughts": "<brief reasoning for THIS move>"}`;
  }

  /** Reflect on a single finished match (captured introspection; no state change). */
  async reflectOnMatch(log: OwnMatchLog): Promise<string> {
    const user = `Your match against ${log.opponent} just finished.
Final score over ${log.rounds.length} rounds: you ${log.myScore}, ${log.opponent} ${log.oppScore}.
Round-by-round (you-them): ${renderRounds(log.rounds)}

Reflect briefly on how this match went.
Respond ONLY with JSON: {"thoughts": "<your reflection>"}`;
    try {
      const parsed = parseJson(await this.client.complete(SEASON_RULES, user));
      return parsed.thoughts?.trim() ?? "";
    } catch {
      return "(no reflection captured)";
    }
  }

  /**
   * The strategy-evolution step: review this generation's own results (raw logs)
   * alongside the standings and the current notebook, then revise the strategy
   * and rewrite the notebook. Mutates {@link declaredStrategy} and {@link notebook}.
   */
  async reflectOnGeneration(
    gen: number,
    myLogs: OwnMatchLog[],
    standings: StandingLine[],
  ): Promise<GenerationReflection> {
    const results = myLogs.length
      ? myLogs
          .map(
            (l) =>
              `  vs ${l.opponent}: ${l.myScore}-${l.oppScore}  [${renderRounds(l.rounds)}]`,
          )
          .join("\n")
      : "  (you played no matches this generation)";
    const board = standings
      .map((s, i) => `  ${i + 1}. ${s.label} — ${s.total} pts`)
      .join("\n");

    const user = `Round robin (generation ${gen}) is complete.

YOUR OWN match results this generation (you-them):
${results}

Season standings so far (total points):
${board}

The strategy you went in with:
${this.declaredStrategy || "(none)"}

Your notebook:
${this.notebook || "(empty)"}

Review your OWN results and revise. Update your STRATEGY for the next round robin and rewrite your NOTEBOOK with the lessons you want to carry forward.
Respond ONLY with JSON: {"strategy": "<revised plan>", "notebook": "<updated notes>", "thoughts": "<what you changed and why>"}`;

    try {
      const parsed = parseJson(await this.client.complete(SEASON_RULES, user));
      if (parsed.strategy?.trim())
        this.declaredStrategy = parsed.strategy.trim();
      if (parsed.notebook?.trim()) this.notebook = parsed.notebook.trim();
      return {
        strategy: this.declaredStrategy,
        notebook: this.notebook,
        thoughts: parsed.thoughts?.trim() ?? "",
      };
    } catch {
      return {
        strategy: this.declaredStrategy,
        notebook: this.notebook,
        thoughts: "(no reflection captured)",
      };
    }
  }
}

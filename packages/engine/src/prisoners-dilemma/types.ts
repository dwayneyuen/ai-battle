/** A single move: Cooperate or Defect. */
export type Move = "C" | "D";

/**
 * A move plus the player's private reasoning for it. LLM players return this so
 * the per-round "why" can be captured; the classic strategies just return a
 * bare {@link Move} (no thoughts), so `next` accepts either form.
 */
export interface MoveResponse {
  move: Move;
  /** Private, per-round reasoning. Captured into the transcript, never shown to the opponent. */
  thoughts?: string;
}

/** What a {@link Strategy}'s `next` may return: a bare move or a move-with-thoughts. */
export type MoveReturn = Move | MoveResponse;

/**
 * Payoff values in the classic T > R > P > S ordering (with 2R > T + S so that
 * steady mutual cooperation beats taking turns exploiting each other). Each
 * value is the number of points the player in question receives.
 */
export interface Payoff {
  /** Temptation: you defect, they cooperate. */
  T: number;
  /** Reward: you both cooperate. */
  R: number;
  /** Punishment: you both defect. */
  P: number;
  /** Sucker: you cooperate, they defect. */
  S: number;
}

/** Axelrod's canonical numbers, as used in "The Selfish Gene". */
export const CLASSIC_PAYOFF: Payoff = { T: 5, R: 3, P: 1, S: 0 };

/**
 * What a strategy is allowed to see when choosing its next move: its own and
 * the opponent's past moves (aligned by index), plus a seeded RNG for the
 * stochastic strategies. Strategies are pure functions of this context — they
 * keep no hidden state — which makes matches reproducible and lets the same
 * strategy object safely play both seats (e.g. against its own twin).
 */
export interface MoveContext {
  /** 0-based index of the round about to be played. */
  round: number;
  /** Total rounds in this match (lets a strategy treat the last round specially). */
  rounds: number;
  /** This player's own past moves, oldest first. */
  myMoves: readonly Move[];
  /** Opponent's past moves; myMoves[i] was played simultaneously with oppMoves[i]. */
  oppMoves: readonly Move[];
  /** Seeded RNG; deterministic given the match seed. */
  rand: () => number;
}

/** A Prisoner's Dilemma player. */
export interface Strategy {
  name: string;
  /** Optional one-line description, shown in reports. */
  description?: string;
  next(ctx: MoveContext): MoveReturn | Promise<MoveReturn>;
}

/** The result of a single round within a match. */
export interface RoundOutcome {
  a: Move;
  b: Move;
  scoreA: number;
  scoreB: number;
  /** Seat A's private reasoning for its move this round, if it provided any. */
  thoughtsA?: string;
  /** Seat B's private reasoning for its move this round, if it provided any. */
  thoughtsB?: string;
}

/** The result of one head-to-head match (a fixed number of rounds). */
export interface MatchResult {
  a: string; // strategy name in seat A
  b: string; // strategy name in seat B
  rounds: RoundOutcome[];
  scoreA: number;
  scoreB: number;
}

export interface PDConfig {
  /** Rounds per match (default 10, the length asked for). */
  rounds?: number;
  payoff?: Payoff;
  seed?: number;
}

export interface TournamentConfig extends PDConfig {
  /** Also pair each strategy against a copy of itself (Axelrod's "twin"). */
  includeSelf?: boolean;
}

/** A single row of the tournament leaderboard. */
export interface Standing {
  name: string;
  /** Total points across every match played. */
  total: number;
  /** Matches played. */
  matches: number;
  /** Total rounds played (matches x rounds). */
  rounds: number;
  /** Average points per round — the fairest cross-comparison metric. */
  avgPerRound: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface TournamentResult {
  standings: Standing[];
  matches: MatchResult[];
  rounds: number;
}

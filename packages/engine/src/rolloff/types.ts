import type { GameEvent } from "../mafia/types";

/**
 * Roll-Off is a pure-luck race used as a SMOKE TEST. Every round each player
 * predicts a die roll (an integer 1-6) — but the harness rolls a fair die
 * itself, so the prediction never affects the outcome. By symmetry every player
 * wins with probability exactly 1/N. Any deviation over a large sample is a bug
 * in the simulation harness, not model skill. The prediction exists only to run
 * the full decision loop (request → validate → forfeit-on-invalid → log).
 */

/** What a player sees when deciding. */
export interface RollOffContext {
  /** This player's display name. */
  you: string;
  round: number;
  yourScore: number;
  /** Current scores of everyone still in the game. */
  scores: { name: string; score: number }[];
  target: number;
  /** Recent event log lines. */
  history: string[];
  prompt: string;
}

export interface RollOffAction {
  /** The player's predicted die roll (1-6). Invalid/missing => forfeit. */
  prediction?: number;
  thoughts?: string;
  /** Raw I/O for full logging, set by LLM agents. */
  diagnostics?: {
    system: string;
    user: string;
    raw: string;
    latencyMs: number;
  };
}

export interface RollOffAgent {
  name: string;
  decide(ctx: RollOffContext): Promise<RollOffAction>;
}

export interface RollOffConfig {
  players: { id: string; name: string }[];
  /** Score to reach to win (default 20). */
  target?: number;
  seed?: number;
  /** Safety cap on rounds. */
  maxRounds?: number;
}

export interface RollOffPlayerResult {
  id: string;
  name: string;
  score: number;
  forfeited: boolean;
  won: boolean;
}

export interface RollOffResult {
  /** Winning seat id, or null for a draw. */
  winner: string | null;
  winnerName: string | null;
  reason: string;
  players: RollOffPlayerResult[];
  events: GameEvent[];
}

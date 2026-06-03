/** A player's secret role. "town" roles win together against the mafia. */
export type Role = "mafia" | "doctor" | "detective" | "villager";

export type Phase = "setup" | "night" | "day-discussion" | "day-vote" | "ended";

export interface Player {
  id: string; // stable id, e.g. "p1"
  name: string; // display name, usually the model, e.g. "GPT-5 (Alice)"
  role: Role;
  alive: boolean;
}

/**
 * Public-facing player info handed to an agent. Note: `role` is omitted for
 * everyone except the agent itself (delivered separately in the context).
 */
export interface PlayerView {
  id: string;
  name: string;
  alive: boolean;
}

/** Something that happened in the game. Drives logs, the UI, and agent memory. */
export interface GameEvent {
  type:
    | "game-start"
    | "role-assigned"
    | "night-falls"
    | "mafia-target"
    | "investigation"
    | "death"
    | "no-death"
    | "day-breaks"
    | "statement"
    | "vote"
    | "elimination"
    | "thought"
    | "result";
  day: number;
  phase: Phase;
  /** Human-readable, spectator-friendly description. */
  message: string;
  actor?: string; // player id who acted
  target?: string; // player id targeted
  data?: Record<string, unknown>;
  /** If set, only these player ids may "remember" this event. Otherwise public. */
  visibleTo?: string[];
}

export type DecisionType =
  | "mafia-kill"
  | "doctor-save"
  | "detective-investigate"
  | "statement"
  | "vote";

/** A request for a single agent to make one decision. */
export interface Decision {
  type: DecisionType;
  /** Human-readable instruction for the agent. */
  prompt: string;
  /** Legal target player ids. Empty for free-text statements. */
  options: string[];
  /** Whether a free-text `text` response is expected/allowed. */
  allowText: boolean;
}

/** Everything an agent is allowed to know when making a decision. */
export interface AgentContext {
  you: { id: string; name: string; role: Role };
  /** Mafia teammates (only populated if `you` is mafia). */
  allies: string[];
  players: PlayerView[];
  day: number;
  phase: Phase;
  /** Public log lines plus anything privately visible to this player. */
  history: string[];
  /** Role-specific private knowledge (investigation results, etc.). */
  notes: string[];
  decision: Decision;
}

/** An agent's response to a decision. */
export interface ActionResult {
  /** Chosen player id (for target/vote decisions). */
  target?: string;
  /** Free-text statement (for discussion). */
  text?: string;
  /** Private reasoning — shown to spectators as the model's "thoughts". */
  reasoning?: string;
}

export interface Agent {
  name: string;
  decide(ctx: AgentContext): Promise<ActionResult>;
}

export interface MafiaConfig {
  players: { id: string; name: string }[];
  roles: { mafia: number; doctor: number; detective: number };
  seed?: number;
  /** How many times each living player speaks during day discussion. */
  discussionRounds?: number;
  /** Reveal a player's role when they die. Classic Mafia does. */
  revealRolesOnDeath?: boolean;
}

export interface GameResult {
  winner: "town" | "mafia";
  reason: string;
  survivors: string[];
  players: Player[];
  events: GameEvent[];
}

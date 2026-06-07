/** A player's secret role. "town" roles win together against the mafia. */
export type Role = "mafia" | "doctor" | "detective" | "villager";

export type Phase = "setup" | "night" | "day-discussion" | "day-vote" | "ended";

export interface Player {
  id: string; // stable id, e.g. "p1"
  name: string; // display name, usually the model, e.g. "GPT-5 (Alice)"
  role: Role;
  alive: boolean;
  /** Set when the player was removed for an invalid/illegal response. */
  forfeited?: boolean;
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

/**
 * Something that happened in a game. Drives logs, the UI, and agent memory.
 * `type` is a free-form string so other games can emit their own event kinds
 * (Mafia uses: game-start, role-assigned, night-falls, mafia-chat, mafia-target,
 * investigation, death, no-death, day-breaks, bid, statement, vote, elimination,
 * forfeit, thought, result).
 */
export interface GameEvent {
  type: string;
  day: number;
  phase: string;
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
  | "bid"
  | "statement"
  | "vote";

/** A request for a single agent to make one decision. */
export interface Decision {
  type: DecisionType;
  /** Human-readable instruction for the agent. */
  prompt: string;
  /** Legal target player ids. Empty for free-text statements and bids. */
  options: string[];
  /** Whether a free-text `text` response is expected/allowed. */
  allowText: boolean;
  /** For `bid` decisions: the top of the urgency scale (e.g. 3). */
  maxUrgency?: number;
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
  /** How urgently the agent wants to speak (for `bid` decisions). */
  urgency?: number;
  /** The model's private "thoughts" — shown to spectators alongside its action. */
  thoughts?: string;
  /** Raw I/O for full logging, set by LLM agents (not by scripted ones). */
  diagnostics?: {
    system: string;
    user: string;
    raw: string;
    latencyMs: number;
  };
}

/** A full record of one model call — emitted via the engine's `onModelCall` hook. */
export interface ModelCall {
  seatId: string;
  seatName: string;
  decisionType: string;
  day: number;
  phase: string;
  /** The system/rules message. */
  system: string;
  /** Exactly what the model saw. */
  user: string;
  /** Exactly what the model returned. */
  raw: string;
  /** The action we parsed out. */
  parsed: Record<string, unknown>;
  thoughts?: string;
  /** Whether the response passed validation (false => the seat forfeited). */
  valid: boolean;
  latencyMs: number;
}

export interface Agent {
  name: string;
  decide(ctx: AgentContext): Promise<ActionResult>;
}

/**
 * Thrown by an agent when the underlying model call fails for INFRASTRUCTURE
 * reasons (network, 5xx, rate limit). This is not the model's fault, so the
 * engine lets it bubble up to void the match — it is never a forfeit.
 */
export class TransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransportError";
  }
}

/** Tunables for a volunteer-loop discussion. */
export interface DiscussionConfig {
  /** Hard cap on total messages, guaranteeing the discussion ends. */
  maxMessages: number;
  /** Max times one player may take the floor. Curbs monopolies. */
  perPlayer: number;
  /** Top of the bid urgency scale. */
  maxUrgency: number;
}

export interface MafiaConfig {
  players: { id: string; name: string }[];
  roles: { mafia: number; doctor: number; detective: number };
  seed?: number;
  /** Reveal a player's role when they die. Classic Mafia does. */
  revealRolesOnDeath?: boolean;
  /** Daytime public discussion settings. */
  discussion?: Partial<DiscussionConfig>;
  /** Mafia-only night coordination chat. Set maxMessages: 0 to disable. */
  mafiaChat?: Partial<DiscussionConfig>;
  /**
   * How many recent transcript lines a player sees when *bidding* to speak.
   * Bids are the most frequent call, so trimming their context is the biggest
   * single lever on cost. Statements/votes/night actions still see everything.
   */
  bidHistoryLimit?: number;
}

/** A recorded forfeit — a model that broke the protocol and was removed. */
export interface Forfeit {
  id: string;
  name: string;
  decisionType: DecisionType;
  reason: string;
  raw?: string;
  day: number;
}

export interface GameResult {
  winner: "town" | "mafia";
  reason: string;
  survivors: string[];
  players: Player[];
  events: GameEvent[];
  forfeits: Forfeit[];
}

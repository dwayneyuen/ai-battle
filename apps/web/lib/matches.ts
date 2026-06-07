import { randomUUID } from "node:crypto";
import {
  runMafia,
  TransportError,
  type GameEvent,
  type GameResult,
  type MafiaConfig,
  type ModelCall,
} from "@ai-battle/engine";
import { agentFromSpec } from "@ai-battle/models";
import { recordMatch, type ModelCallInput } from "@ai-battle/db";

// In-game seat names.
const NAMES = ["Alice", "Bob", "Carol", "Dave", "Erin", "Frank", "Grace"];

// A cheap default roster via OpenRouter (one key reaches all of these).
// NOTE: exact slugs occasionally change — adjust against openrouter.ai/models.
const DEFAULT_ROSTER = [
  "openrouter:openai/gpt-5-mini",
  "openrouter:google/gemini-2.5-flash",
  "openrouter:anthropic/claude-3.5-haiku",
  "openrouter:meta-llama/llama-3.3-70b-instruct",
  "openrouter:deepseek/deepseek-chat",
  "openrouter:qwen/qwen-2.5-72b-instruct",
  "openrouter:mistralai/mistral-small",
];

interface Seat {
  seatId: string;
  seatName: string;
  spec: string;
  provider: string;
  label: string;
}

interface LiveMatch {
  id: string;
  status: "running" | "completed" | "void";
  mock: boolean;
  createdAt: number;
  seats: Seat[];
  events: GameEvent[];
  modelCalls: (ModelCall & { idx: number })[];
  result?: GameResult;
  error?: string;
}

// Module-level store. The web app is a single persistent process (Render), so
// this lives for the lifetime of the server — long enough to watch a game.
const live = new Map<string, LiveMatch>();

function specParts(spec: string): { provider: string; label: string } {
  const i = spec.indexOf(":");
  return i === -1
    ? { provider: spec, label: spec }
    : { provider: spec.slice(0, i), label: spec.slice(i + 1) };
}

/** Kick off a Mafia game in the background and return its id immediately. */
export function startMatch(opts: {
  mock?: boolean;
  models?: string[];
}): string {
  const id = randomUUID();
  const roster =
    opts.models && opts.models.length ? opts.models : DEFAULT_ROSTER;
  const seats: Seat[] = roster.slice(0, NAMES.length).map((spec, i) => ({
    seatId: `p${i + 1}`,
    seatName: NAMES[i],
    spec,
    ...specParts(spec),
  }));
  const match: LiveMatch = {
    id,
    status: "running",
    mock: opts.mock ?? false,
    createdAt: Date.now(),
    seats,
    events: [],
    modelCalls: [],
  };
  live.set(id, match);
  void play(match); // fire-and-forget; the persistent process keeps it running
  return id;
}

async function play(match: LiveMatch): Promise<void> {
  const agents: Record<string, ReturnType<typeof agentFromSpec>> = {};
  for (const s of match.seats) {
    agents[s.seatId] = agentFromSpec(match.mock ? "mock" : s.spec, s.seatName);
  }
  const config: MafiaConfig = {
    players: match.seats.map((s) => ({ id: s.seatId, name: s.seatName })),
    roles: { mafia: 2, doctor: 1, detective: 1 },
    revealRolesOnDeath: true,
  };
  try {
    const result = await runMafia(
      config,
      agents,
      (e) => match.events.push(e),
      (c) => match.modelCalls.push({ ...c, idx: match.modelCalls.length }),
    );
    match.result = result;
    match.status = "completed";
    await persist(match);
  } catch (err) {
    match.status = "void";
    match.error =
      err instanceof TransportError
        ? `match voided (transport error): ${err.message}`
        : String((err as Error)?.message ?? err);
  }
}

async function persist(match: LiveMatch): Promise<void> {
  const result = match.result!;
  const seatById = new Map(match.seats.map((s) => [s.seatId, s]));
  const players = result.players.map((p) => {
    const seat = seatById.get(p.id)!;
    const onWinningSide =
      result.winner === "mafia" ? p.role === "mafia" : p.role !== "mafia";
    return {
      seatId: p.id,
      seatName: p.name,
      spec: seat.spec,
      label: seat.label,
      provider: seat.provider,
      role: p.role,
      alive: p.alive,
      forfeited: p.forfeited ?? false,
      won: onWinningSide && !(p.forfeited ?? false),
    };
  });
  const events = result.events.map((e, idx) => ({
    idx,
    type: e.type,
    message: e.message,
    actorSeatId: e.actor,
    targetSeatId: e.target,
    day: e.day,
    phase: e.phase,
    data: e.data,
    visibleTo: e.visibleTo ?? [],
  }));
  const modelCalls: ModelCallInput[] = match.modelCalls.map((c) => ({
    idx: c.idx,
    seatId: c.seatId,
    seatName: c.seatName,
    decisionType: c.decisionType,
    day: c.day,
    phase: c.phase,
    system: c.system,
    user: c.user,
    raw: c.raw,
    parsed: c.parsed,
    thoughts: c.thoughts,
    valid: c.valid,
    latencyMs: c.latencyMs,
  }));
  try {
    await recordMatch({
      id: match.id,
      game: "mafia",
      status: "completed",
      winner: result.winner,
      reason: result.reason,
      config: { mock: match.mock, roster: match.seats.map((s) => s.spec) },
      players,
      events,
      modelCalls,
    });
  } catch (err) {
    match.error = `saved-to-db failed: ${String((err as Error)?.message ?? err)}`;
  }
}

/** A JSON-safe view of a live match for the API. */
export function snapshot(m: LiveMatch) {
  return {
    id: m.id,
    status: m.status,
    source: "live" as const,
    mock: m.mock,
    winner: m.result?.winner ?? null,
    reason: m.result?.reason ?? null,
    error: m.error ?? null,
    players: m.seats.map((s) => ({
      seatId: s.seatId,
      seatName: s.seatName,
      label: s.label,
    })),
    events: m.events.map((e, idx) => ({
      idx,
      type: e.type,
      message: e.message,
      day: e.day,
      phase: e.phase,
      private: Boolean(e.visibleTo),
    })),
    forfeits:
      m.result?.forfeits.map((f) => ({ name: f.name, reason: f.reason })) ?? [],
  };
}

export function getLiveMatch(id: string): LiveMatch | undefined {
  return live.get(id);
}

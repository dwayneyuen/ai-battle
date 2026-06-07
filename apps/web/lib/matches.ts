import { randomUUID } from "node:crypto";
import {
  runMafia,
  runRollOff,
  TransportError,
  type GameEvent,
  type MafiaConfig,
  type ModelCall,
  type RollOffConfig,
} from "@ai-battle/engine";
import { agentFromSpec, rollOffAgentFromSpec } from "@ai-battle/models";
import { recordMatch, type ModelCallInput } from "@ai-battle/db";
import { MODELS } from "@ai-battle/catalog";

export type GameId = "mafia" | "rolloff";

// The roster is the catalog's model list (single source of truth) — one model
// per family, each under a pun-name that decodes to it.
const ROSTER = MODELS.map((m) => ({ name: m.name, spec: m.spec }));

interface Seat {
  seatId: string;
  seatName: string;
  spec: string;
  provider: string;
  label: string;
}

interface SeatOutcome {
  seatId: string;
  role: string;
  alive: boolean;
  forfeited: boolean;
  won: boolean;
}

interface LiveMatch {
  id: string;
  game: GameId;
  status: "running" | "completed" | "void";
  mock: boolean;
  createdAt: number;
  seats: Seat[];
  events: GameEvent[];
  modelCalls: (ModelCall & { idx: number })[];
  outcome?: { winner: string | null; reason: string; seats: SeatOutcome[] };
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

/** Kick off a game in the background and return its id immediately. */
export function startMatch(opts: { game: GameId; mock?: boolean }): string {
  const id = randomUUID();
  const mock = opts.mock ?? false;
  const seats: Seat[] = ROSTER.map((r, i) => {
    const spec = mock ? "mock" : r.spec;
    return { seatId: `p${i + 1}`, seatName: r.name, spec, ...specParts(spec) };
  });
  const match: LiveMatch = {
    id,
    game: opts.game,
    status: "running",
    mock,
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
  try {
    if (match.game === "rolloff") await playRollOff(match);
    else await playMafia(match);
    match.status = "completed";
    // Mock games are ephemeral pipeline tests — don't persist or rate them.
    if (!match.mock) await persist(match);
  } catch (err) {
    match.status = "void";
    match.error =
      err instanceof TransportError
        ? `match voided (transport error): ${err.message}`
        : String((err as Error)?.message ?? err);
  }
}

const onEvent = (m: LiveMatch) => (e: GameEvent) => m.events.push(e);
const onCall = (m: LiveMatch) => (c: ModelCall) =>
  m.modelCalls.push({ ...c, idx: m.modelCalls.length });

async function playMafia(match: LiveMatch): Promise<void> {
  const agents = Object.fromEntries(
    match.seats.map((s) => [s.seatId, agentFromSpec(s.spec, s.seatName)]),
  );
  const config: MafiaConfig = {
    players: match.seats.map((s) => ({ id: s.seatId, name: s.seatName })),
    roles: { mafia: 2, doctor: 1, detective: 1 },
    revealRolesOnDeath: true,
  };
  const result = await runMafia(config, agents, onEvent(match), onCall(match));
  match.outcome = {
    winner: result.winner,
    reason: result.reason,
    seats: result.players.map((p) => {
      const onWinningSide =
        result.winner === "mafia" ? p.role === "mafia" : p.role !== "mafia";
      return {
        seatId: p.id,
        role: p.role,
        alive: p.alive,
        forfeited: p.forfeited ?? false,
        won: onWinningSide && !(p.forfeited ?? false),
      };
    }),
  };
}

async function playRollOff(match: LiveMatch): Promise<void> {
  const agents = Object.fromEntries(
    match.seats.map((s) => [
      s.seatId,
      rollOffAgentFromSpec(s.spec, s.seatName),
    ]),
  );
  const config: RollOffConfig = {
    players: match.seats.map((s) => ({ id: s.seatId, name: s.seatName })),
    target: 25,
  };
  const result = await runRollOff(
    config,
    agents,
    onEvent(match),
    onCall(match),
  );
  match.outcome = {
    winner: result.winnerName,
    reason: result.reason,
    seats: result.players.map((p) => ({
      seatId: p.id,
      role: "player",
      alive: !p.forfeited,
      forfeited: p.forfeited,
      won: p.won,
    })),
  };
}

async function persist(match: LiveMatch): Promise<void> {
  const outcome = match.outcome;
  if (!outcome) return;
  const seatById = new Map(match.seats.map((s) => [s.seatId, s]));
  const players = outcome.seats.map((o) => {
    const seat = seatById.get(o.seatId)!;
    return {
      seatId: o.seatId,
      seatName: seat.seatName,
      spec: seat.spec,
      label: seat.label,
      provider: seat.provider,
      role: o.role,
      alive: o.alive,
      forfeited: o.forfeited,
      won: o.won,
    };
  });
  const events = match.events.map((e, idx) => ({
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
      game: match.game,
      status: "completed",
      winner: outcome.winner ?? undefined,
      reason: outcome.reason,
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
export function snapshot(m: LiveMatch, includeCalls = false) {
  const seatById = new Map(m.seats.map((s) => [s.seatId, s]));
  return {
    id: m.id,
    game: m.game,
    status: m.status,
    source: "live" as const,
    mock: m.mock,
    winner: m.outcome?.winner ?? null,
    reason: m.outcome?.reason ?? null,
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
    forfeits: (m.outcome?.seats ?? [])
      .filter((s) => s.forfeited)
      .map((s) => ({
        name: seatById.get(s.seatId)?.seatName ?? s.seatId,
        reason: "forfeited",
      })),
    rules: includeCalls ? (m.modelCalls[0]?.system ?? null) : undefined,
    calls: includeCalls
      ? m.modelCalls.map((c) => ({
          idx: c.idx,
          seatName: c.seatName,
          decisionType: c.decisionType,
          day: c.day,
          phase: c.phase,
          prompt: c.user,
          response: c.raw,
          thoughts: c.thoughts ?? null,
          valid: c.valid,
          latencyMs: c.latencyMs,
        }))
      : undefined,
  };
}

export function getLiveMatch(id: string): LiveMatch | undefined {
  return live.get(id);
}

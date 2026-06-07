import { PrismaClient } from "@prisma/client";

/**
 * The ONE Prisma client for the whole app. Both the match runner and the web
 * app import helpers from this module — there is no other path to the database
 * and no hand-written SQL. The schema (../prisma/schema.prisma) is the single
 * source of truth.
 */
const g = globalThis as unknown as { __aiBattlePrisma?: PrismaClient };
export const prisma = g.__aiBattlePrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.__aiBattlePrisma = prisma;

// --- Inputs ----------------------------------------------------------------

export interface MatchPlayerInput {
  seatId: string; // "p1"
  seatName: string; // "Alice"
  spec: string; // model spec, e.g. "openrouter:openai/gpt-5"
  label: string; // display label
  provider: string;
  role: string;
  alive: boolean;
  forfeited: boolean;
  won: boolean;
}

export interface MatchEventInput {
  idx: number;
  type: string;
  message: string;
  actorSeatId?: string;
  targetSeatId?: string;
  day: number;
  phase: string;
  data?: unknown;
  visibleTo?: string[];
}

export interface ModelCallInput {
  idx: number;
  seatId: string;
  seatName: string;
  decisionType: string;
  day: number;
  phase: string;
  system: string;
  user: string;
  raw: string;
  parsed?: unknown;
  thoughts?: string;
  valid: boolean;
  latencyMs?: number;
}

export interface RecordMatchInput {
  /** Optional explicit id (so the in-memory live match and DB row share one id). */
  id?: string;
  game: string;
  seed?: string;
  status: "completed" | "void";
  /** Winner label — game-specific (e.g. "town"/"mafia", or a winning seat name). */
  winner?: string;
  reason?: string;
  config?: unknown;
  players: MatchPlayerInput[];
  events: MatchEventInput[];
  /** Full per-call model logs (prompt seen, raw response, parsed action). */
  modelCalls?: ModelCallInput[];
}

// --- ELO -------------------------------------------------------------------

const K = 32;
const expected = (a: number, b: number) => 1 / (1 + 10 ** ((b - a) / 400));

// --- Writes ----------------------------------------------------------------

/**
 * Persist a finished match: upserts the competing models, writes the match,
 * its seats and full transcript, and (for completed matches) updates team ELO.
 * Returns the new match id. All in one transaction.
 */
export async function recordMatch(input: RecordMatchInput): Promise<string> {
  return prisma.$transaction(async (tx) => {
    // Upsert each model and make sure it has a rating row; remember current ELO.
    const seat = new Map<string, { modelId: string; elo: number }>();
    for (const p of input.players) {
      const model = await tx.model.upsert({
        where: { spec: p.spec },
        update: { label: p.label },
        create: { spec: p.spec, label: p.label, provider: p.provider },
      });
      const rating = await tx.rating.upsert({
        where: { modelId_game: { modelId: model.id, game: input.game } },
        update: {},
        create: { modelId: model.id, game: input.game },
      });
      seat.set(p.seatId, { modelId: model.id, elo: rating.elo });
    }

    const match = await tx.match.create({
      data: {
        id: input.id,
        game: input.game,
        seed: input.seed,
        status: input.status,
        winner: input.winner,
        reason: input.reason,
        config: (input.config ?? undefined) as never,
        finishedAt: new Date(),
        calls: {
          create: (input.modelCalls ?? []).map((c) => ({
            idx: c.idx,
            seatId: c.seatId,
            seatName: c.seatName,
            decisionType: c.decisionType,
            day: c.day,
            phase: c.phase,
            systemPrompt: c.system,
            userPrompt: c.user,
            rawResponse: c.raw,
            parsed: (c.parsed ?? undefined) as never,
            thoughts: c.thoughts,
            valid: c.valid,
            latencyMs: c.latencyMs,
          })),
        },
        players: {
          create: input.players.map((p) => ({
            modelId: seat.get(p.seatId)!.modelId,
            seatId: p.seatId,
            seatName: p.seatName,
            role: p.role,
            alive: p.alive,
            forfeited: p.forfeited,
            won: p.won,
          })),
        },
        events: {
          create: input.events.map((e) => ({
            idx: e.idx,
            type: e.type,
            message: e.message,
            actorSeatId: e.actorSeatId,
            targetSeatId: e.targetSeatId,
            day: e.day,
            phase: e.phase,
            data: (e.data ?? undefined) as never,
            visibleTo: e.visibleTo ?? [],
          })),
        },
      },
    });

    if (input.status === "completed") {
      const winners = input.players.filter((p) => p.won);
      const losers = input.players.filter((p) => !p.won);
      const avg = (ps: MatchPlayerInput[]) =>
        ps.length
          ? ps.reduce((s, p) => s + seat.get(p.seatId)!.elo, 0) / ps.length
          : 1000;
      const eWin = expected(avg(winners), avg(losers));
      for (const p of input.players) {
        const exp = p.won ? eWin : 1 - eWin;
        const delta = Math.round(K * ((p.won ? 1 : 0) - exp));
        await tx.rating.update({
          where: {
            modelId_game: {
              modelId: seat.get(p.seatId)!.modelId,
              game: input.game,
            },
          },
          data: {
            elo: { increment: delta },
            games: { increment: 1 },
            wins: { increment: p.won ? 1 : 0 },
            losses: { increment: p.won ? 0 : 1 },
            forfeits: { increment: p.forfeited ? 1 : 0 },
          },
        });
      }
    }

    return match.id;
  });
}

// --- Reads (used by the web app) -------------------------------------------

export function getLeaderboard(game = "mafia") {
  return prisma.rating.findMany({
    where: { game },
    orderBy: [{ elo: "desc" }, { wins: "desc" }],
    include: { model: true },
  });
}

export function listMatches(game = "mafia", take = 50) {
  return prisma.match.findMany({
    where: { game },
    orderBy: { finishedAt: "desc" },
    take,
    include: { players: { include: { model: true } } },
  });
}

export function getMatch(id: string) {
  return prisma.match.findUnique({
    where: { id },
    include: {
      players: { include: { model: true } },
      events: { orderBy: { idx: "asc" } },
      calls: { orderBy: { idx: "asc" } },
    },
  });
}

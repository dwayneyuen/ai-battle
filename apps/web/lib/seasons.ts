import { randomUUID } from "node:crypto";
import { runMatch } from "@ai-battle/engine";
import { SeasonAgent, type OwnMatchLog } from "@ai-battle/models";
import {
  getPdSeason,
  recordPdSeason,
  type PdGenerationInput,
} from "@ai-battle/db";

/**
 * Live, in-memory driver for a Prisoner's Dilemma SEASON, mirroring lib/matches
 * for Mafia. A season has each model declare an opening strategy, play a round
 * robin against every other model, reflect after every match, then revise its
 * strategy and notebook after every round robin — repeated across generations.
 *
 * The whole thing runs in the background of the persistent web process; the
 * snapshot updates as it goes so the replay page can stream progress. On
 * completion it is persisted via recordPdSeason (mock seasons are ephemeral).
 */

// A small, cheap roster (1v1 round robin is O(n^2) matches, so keep it tight).
const ROSTER = [
  { label: "Gepetto", spec: "openrouter:openai/gpt-5-mini" },
  { label: "Jiminy", spec: "openrouter:google/gemini-2.5-flash" },
  { label: "Claude", spec: "openrouter:anthropic/claude-haiku-4.5" },
  { label: "Deepak", spec: "openrouter:deepseek/deepseek-chat-v3.1" },
];

const DEFAULTS = { rounds: 8, generations: 3 };

export interface SeasonRoundView {
  a: "C" | "D";
  b: "C" | "D";
  scoreA: number;
  scoreB: number;
  thoughtsA?: string;
  thoughtsB?: string;
}
export interface SeasonMatchView {
  aLabel: string;
  bLabel: string;
  scoreA: number;
  scoreB: number;
  rounds: SeasonRoundView[];
  reflections: { label: string; thoughts: string }[];
}
export interface SeasonGenerationView {
  idx: number;
  matches: SeasonMatchView[];
  standings: { label: string; total: number }[];
  revisions: {
    label: string;
    strategy: string;
    notebook: string;
    thoughts: string;
  }[];
}
export interface SeasonSnapshot {
  id: string;
  status: "running" | "completed" | "void";
  source: "live" | "db";
  mock: boolean;
  error: string | null;
  config: { rounds: number; generations: number };
  players: { label: string }[];
  declarations: { label: string; strategy: string; thoughts: string }[];
  generations: SeasonGenerationView[];
  finalStandings: { label: string; total: number }[];
}

interface LiveSeason {
  id: string;
  mock: boolean;
  createdAt: number;
  rounds: number;
  generationsTarget: number;
  specByLabel: Map<string, string>;
  snap: SeasonSnapshot;
}

const live = new Map<string, LiveSeason>();

function provider(spec: string): string {
  return spec === "mock" || spec.startsWith("mock:")
    ? "mock"
    : spec.slice(0, spec.indexOf(":"));
}

/** Kick off a season in the background and return its id immediately. */
export function startSeason(opts: { mock?: boolean }): string {
  const id = randomUUID();
  const mock = opts.mock ?? false;
  const seats = mock
    ? ROSTER.map((r, i) => ({ label: r.label, spec: `mock:${i + 1}` }))
    : ROSTER.map((r) => ({ label: r.label, spec: r.spec }));

  const season: LiveSeason = {
    id,
    mock,
    createdAt: Date.now(),
    rounds: DEFAULTS.rounds,
    generationsTarget: DEFAULTS.generations,
    specByLabel: new Map(seats.map((s) => [s.label, s.spec])),
    snap: {
      id,
      status: "running",
      source: "live",
      mock,
      error: null,
      config: { rounds: DEFAULTS.rounds, generations: DEFAULTS.generations },
      players: seats.map((s) => ({ label: s.label })),
      declarations: [],
      generations: [],
      finalStandings: [],
    },
  };
  live.set(id, season);
  void play(season, seats); // fire-and-forget
  return id;
}

async function play(
  season: LiveSeason,
  seats: { label: string; spec: string }[],
): Promise<void> {
  const { rounds, generationsTarget: G } = season;
  const snap = season.snap;
  try {
    const agents = seats.map((s) => new SeasonAgent(s.spec, s.label));
    const total = new Map<string, number>(seats.map((s) => [s.label, 0]));

    // Opening declarations (level "initial").
    for (const agent of agents) {
      const opponents = agents.filter((x) => x !== agent).map((x) => x.label);
      const d = await agent.declareInitial(rounds, opponents);
      snap.declarations.push({ label: agent.label, ...d });
    }

    for (let g = 0; g < G; g++) {
      const genView: SeasonGenerationView = {
        idx: g,
        matches: [],
        standings: [],
        revisions: [],
      };
      snap.generations.push(genView);
      const ownLogs = new Map<string, OwnMatchLog[]>(
        seats.map((s) => [s.label, []]),
      );

      for (let i = 0; i < agents.length; i++) {
        for (let j = i + 1; j < agents.length; j++) {
          const a = agents[i];
          const b = agents[j];
          const result = await runMatch(
            a.strategyForMatch(b.label, g + 1),
            b.strategyForMatch(a.label, g + 1),
            { rounds, seed: g * 100_000 + i * 1000 + j },
          );
          total.set(a.label, (total.get(a.label) ?? 0) + result.scoreA);
          total.set(b.label, (total.get(b.label) ?? 0) + result.scoreB);

          const logA: OwnMatchLog = {
            opponent: b.label,
            rounds: result.rounds.map((r) => ({ mine: r.a, theirs: r.b })),
            myScore: result.scoreA,
            oppScore: result.scoreB,
          };
          const logB: OwnMatchLog = {
            opponent: a.label,
            rounds: result.rounds.map((r) => ({ mine: r.b, theirs: r.a })),
            myScore: result.scoreB,
            oppScore: result.scoreA,
          };
          ownLogs.get(a.label)!.push(logA);
          ownLogs.get(b.label)!.push(logB);

          const [reflA, reflB] = await Promise.all([
            a.reflectOnMatch(logA),
            b.reflectOnMatch(logB),
          ]);

          genView.matches.push({
            aLabel: a.label,
            bLabel: b.label,
            scoreA: result.scoreA,
            scoreB: result.scoreB,
            rounds: result.rounds.map((r) => ({
              a: r.a,
              b: r.b,
              scoreA: r.scoreA,
              scoreB: r.scoreB,
              thoughtsA: r.thoughtsA,
              thoughtsB: r.thoughtsB,
            })),
            reflections: [
              { label: a.label, thoughts: reflA },
              { label: b.label, thoughts: reflB },
            ],
          });
        }
      }

      const standings = seats
        .map((s) => ({ label: s.label, total: total.get(s.label)! }))
        .sort((x, y) => y.total - x.total);
      genView.standings = standings;
      snap.finalStandings = standings;

      for (const agent of agents) {
        const r = await agent.reflectOnGeneration(
          g + 1,
          ownLogs.get(agent.label)!,
          standings,
        );
        genView.revisions.push({ label: agent.label, ...r });
      }
    }

    snap.status = "completed";
    if (!season.mock) await persist(season, seats);
  } catch (err) {
    snap.status = "void";
    snap.error = String((err as Error)?.message ?? err);
  }
}

async function persist(
  season: LiveSeason,
  seats: { label: string; spec: string }[],
): Promise<void> {
  const snap = season.snap;
  const specOf = (label: string) => season.specByLabel.get(label)!;

  const generations: PdGenerationInput[] = snap.generations.map((g) => ({
    idx: g.idx,
    matches: g.matches.map((m) => ({
      aSpec: specOf(m.aLabel),
      bSpec: specOf(m.bLabel),
      scoreA: m.scoreA,
      scoreB: m.scoreB,
      rounds: m.rounds.map((r, idx) => ({
        idx,
        moveA: r.a,
        moveB: r.b,
        scoreA: r.scoreA,
        scoreB: r.scoreB,
        thoughtsA: r.thoughtsA,
        thoughtsB: r.thoughtsB,
      })),
      reflections: m.reflections.map((r) => ({
        spec: specOf(r.label),
        thoughts: r.thoughts,
      })),
    })),
    generationReflections: g.revisions.map((r) => ({
      spec: specOf(r.label),
      strategy: r.strategy,
      notebook: r.notebook,
      thoughts: r.thoughts,
    })),
    standings: g.standings.map((s) => ({
      spec: specOf(s.label),
      label: s.label,
      total: s.total,
    })),
  }));

  try {
    await recordPdSeason({
      config: {
        rounds: season.rounds,
        generations: season.generationsTarget,
        field: seats.map((s) => s.spec),
      },
      players: seats.map((s) => ({
        spec: s.spec,
        label: s.label,
        provider: provider(s.spec),
      })),
      initialDeclarations: snap.declarations.map((d) => ({
        spec: specOf(d.label),
        strategy: d.strategy,
        thoughts: d.thoughts,
      })),
      generations,
    });
  } catch (err) {
    snap.error = `saved-to-db failed: ${String((err as Error)?.message ?? err)}`;
  }
}

export function getLiveSeason(id: string): SeasonSnapshot | undefined {
  return live.get(id)?.snap;
}

/** Load a finished season from the database into the same snapshot shape. */
export async function dbSeasonSnapshot(
  id: string,
): Promise<SeasonSnapshot | null> {
  const s = await getPdSeason(id);
  if (!s) return null;

  const cfg = (s.config ?? {}) as { rounds?: number; generations?: number };
  const initial = s.reflections.filter((r) => r.level === "initial");
  const players = new Map<string, { label: string }>();
  for (const m of s.generations.flatMap((g) => g.matches)) {
    players.set(m.aModel.label, { label: m.aModel.label });
    players.set(m.bModel.label, { label: m.bModel.label });
  }

  const stdJson = (v: unknown): { label: string; total: number }[] =>
    Array.isArray(v)
      ? (v as { label: string; total: number }[]).map((x) => ({
          label: x.label,
          total: x.total,
        }))
      : [];

  const generations: SeasonGenerationView[] = s.generations.map((g) => ({
    idx: g.idx,
    standings: stdJson(g.standings),
    matches: g.matches.map((m) => ({
      aLabel: m.aModel.label,
      bLabel: m.bModel.label,
      scoreA: m.scoreA,
      scoreB: m.scoreB,
      rounds: m.rounds.map((r) => ({
        a: r.moveA as "C" | "D",
        b: r.moveB as "C" | "D",
        scoreA: r.scoreA,
        scoreB: r.scoreB,
        thoughtsA: r.thoughtsA ?? undefined,
        thoughtsB: r.thoughtsB ?? undefined,
      })),
      reflections: s.reflections
        .filter((r) => r.level === "match" && r.matchId === m.id)
        .map((r) => ({ label: r.model.label, thoughts: r.thoughts ?? "" })),
    })),
    revisions: s.reflections
      .filter((r) => r.level === "generation" && r.generationId === g.id)
      .map((r) => ({
        label: r.model.label,
        strategy: r.strategy ?? "",
        notebook: r.notebook ?? "",
        thoughts: r.thoughts ?? "",
      })),
  }));

  const finalStandings =
    generations.length > 0 ? generations[generations.length - 1].standings : [];

  return {
    id: s.id,
    status: s.status === "void" ? "void" : "completed",
    source: "db",
    mock: false,
    error: null,
    config: { rounds: cfg.rounds ?? 0, generations: cfg.generations ?? 0 },
    players: [...players.values()],
    declarations: initial.map((r) => ({
      label: r.model.label,
      strategy: r.strategy ?? "",
      thoughts: r.thoughts ?? "",
    })),
    generations,
    finalStandings,
  };
}

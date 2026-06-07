import { mulberry32 } from "../rng";
import {
  CLASSIC_PAYOFF,
  type MatchResult,
  type Move,
  type MoveReturn,
  type Payoff,
  type PDConfig,
  type RoundOutcome,
  type Standing,
  type Strategy,
  type TournamentConfig,
  type TournamentResult,
} from "./types";

/** Points awarded to [A, B] for a single round. */
function scoreRound(a: Move, b: Move, p: Payoff): [number, number] {
  if (a === "C" && b === "C") return [p.R, p.R];
  if (a === "C" && b === "D") return [p.S, p.T];
  if (a === "D" && b === "C") return [p.T, p.S];
  return [p.P, p.P];
}

/**
 * Coerce a strategy's response into a legal move (defaults to Cooperate) and
 * pull out any private thoughts. Accepts both the bare-`Move` form used by the
 * classic strategies and the `{ move, thoughts }` form used by LLM players.
 */
function normalize(r: MoveReturn): { move: Move; thoughts?: string } {
  if (typeof r === "string") return { move: r === "D" ? "D" : "C" };
  return { move: r.move === "D" ? "D" : "C", thoughts: r.thoughts };
}

/**
 * Plays one head-to-head match of `rounds` simultaneous-move rounds. Each round
 * both players choose at the same time, seeing only the history *before* this
 * round — so neither can react to the other within a round.
 */
export async function runMatch(
  a: Strategy,
  b: Strategy,
  config: PDConfig = {},
): Promise<MatchResult> {
  const rounds = config.rounds ?? 10;
  const payoff = config.payoff ?? CLASSIC_PAYOFF;
  const seed = config.seed ?? (Math.random() * 2 ** 32) >>> 0;
  // Independent RNG streams so the two seats can't share/peek at randomness.
  const randA = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const randB = mulberry32((seed ^ 0x85ebca6b) >>> 0);

  const aMoves: Move[] = [];
  const bMoves: Move[] = [];
  const outcomes: RoundOutcome[] = [];
  let scoreA = 0;
  let scoreB = 0;

  for (let round = 0; round < rounds; round++) {
    const [rawA, rawB] = await Promise.all([
      a.next({ round, rounds, myMoves: aMoves, oppMoves: bMoves, rand: randA }),
      b.next({ round, rounds, myMoves: bMoves, oppMoves: aMoves, rand: randB }),
    ]);
    const { move: ma, thoughts: thoughtsA } = normalize(rawA);
    const { move: mb, thoughts: thoughtsB } = normalize(rawB);
    const [sa, sb] = scoreRound(ma, mb, payoff);
    aMoves.push(ma);
    bMoves.push(mb);
    scoreA += sa;
    scoreB += sb;
    outcomes.push({
      a: ma,
      b: mb,
      scoreA: sa,
      scoreB: sb,
      thoughtsA,
      thoughtsB,
    });
  }

  return { a: a.name, b: b.name, rounds: outcomes, scoreA, scoreB };
}

/**
 * Runs a full round-robin: every strategy plays every other (and, by default,
 * its own twin — as in Axelrod's tournament). Returns a leaderboard ranked by
 * total points, the metric "The Selfish Gene" uses to crown Tit for Tat.
 */
export async function runTournament(
  strategies: Strategy[],
  config: TournamentConfig = {},
): Promise<TournamentResult> {
  const rounds = config.rounds ?? 10;
  const includeSelf = config.includeSelf ?? true;
  const baseSeed = config.seed ?? 1;

  const matches: MatchResult[] = [];
  const tally = new Map<
    string,
    {
      total: number;
      matches: number;
      wins: number;
      losses: number;
      draws: number;
    }
  >();
  const row = (name: string) => {
    let r = tally.get(name);
    if (!r) {
      r = { total: 0, matches: 0, wins: 0, losses: 0, draws: 0 };
      tally.set(name, r);
    }
    return r;
  };
  // Ensure every strategy appears even if (somehow) it plays no matches.
  for (const s of strategies) row(s.name);

  for (let i = 0; i < strategies.length; i++) {
    for (let j = includeSelf ? i : i + 1; j < strategies.length; j++) {
      const m = await runMatch(strategies[i], strategies[j], {
        rounds,
        payoff: config.payoff,
        seed: baseSeed + i * 1000 + j,
      });
      matches.push(m);

      if (i === j) {
        // Self-play (twin): credit the strategy once with its own-seat score.
        const r = row(strategies[i].name);
        r.total += m.scoreA;
        r.matches += 1;
        r.draws += 1;
        continue;
      }
      const ra = row(strategies[i].name);
      const rb = row(strategies[j].name);
      ra.total += m.scoreA;
      rb.total += m.scoreB;
      ra.matches += 1;
      rb.matches += 1;
      if (m.scoreA > m.scoreB) {
        ra.wins += 1;
        rb.losses += 1;
      } else if (m.scoreA < m.scoreB) {
        ra.losses += 1;
        rb.wins += 1;
      } else {
        ra.draws += 1;
        rb.draws += 1;
      }
    }
  }

  const standings: Standing[] = [...tally.entries()]
    .map(([name, r]) => ({
      name,
      total: r.total,
      matches: r.matches,
      rounds: r.matches * rounds,
      avgPerRound: r.matches ? r.total / (r.matches * rounds) : 0,
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
    }))
    .sort((x, y) => y.total - x.total || y.avgPerRound - x.avgPerRound);

  return { standings, matches, rounds };
}

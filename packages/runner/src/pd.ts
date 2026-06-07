import {
  CLASSIC_PAYOFF,
  CLASSIC_STRATEGIES,
  STRATEGIES_BY_KEY,
  random as randomStrategy,
  runMatch,
  runTournament,
  type MatchResult,
  type Strategy,
} from "@ai-battle/engine";
import { pdStrategyFromSpec } from "@ai-battle/models";
import pc from "picocolors";

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        flags.add(key);
      }
    }
  }
  return { args, flags };
}

/** Resolve a token to a strategy: a classic key, "mock"/"random", or a model spec. */
function resolve(token: string): Strategy {
  const key = token.toLowerCase();
  if (STRATEGIES_BY_KEY[key]) return STRATEGIES_BY_KEY[key];
  if (key === "mock" || key === "random") return randomStrategy;
  if (token.includes(":")) return pdStrategyFromSpec(token);
  throw new Error(
    `Unknown strategy "${token}". Use one of: ${Object.keys(
      STRATEGIES_BY_KEY,
    ).join(", ")} — or a model spec like "openai:gpt-5-mini".`,
  );
}

const move = (m: "C" | "D") => (m === "C" ? pc.green("C") : pc.red("D"));

/** Pretty round-by-round trace of a single match. */
function printMatch(m: MatchResult) {
  console.log(
    pc.bold(`\n  ${m.a}  vs  ${m.b}   (${m.rounds.length} rounds)\n`),
  );
  console.log(pc.dim(`  rnd   ${m.a}   ${m.b}     score`));
  m.rounds.forEach((r, i) => {
    console.log(
      `  ${String(i + 1).padStart(2)}     ${move(r.a)}     ${move(
        r.b,
      )}     ${pc.dim(`${r.scoreA} / ${r.scoreB}`)}`,
    );
  });
  const verdict =
    m.scoreA > m.scoreB
      ? `${m.a} wins`
      : m.scoreB > m.scoreA
        ? `${m.b} wins`
        : "tie";
  console.log(
    pc.bold(`\n  Total:  ${m.scoreA} / ${m.scoreB}  → ${pc.cyan(verdict)}\n`),
  );
}

async function main() {
  const { args, flags } = parseArgs(process.argv.slice(2));
  const rounds = Number(args.rounds ?? 10);
  const seed = args.seed ? Number(args.seed) : 1;
  const includeSelf = !flags.has("no-self");

  console.log(
    pc.bold(
      pc.cyan(
        `\n  AI BATTLE — Prisoner's Dilemma (iterated, ${rounds} rounds)`,
      ),
    ),
  );
  console.log(
    pc.dim(
      `  payoff  both-C=${CLASSIC_PAYOFF.R}  defect/cooperate=${CLASSIC_PAYOFF.T}/${CLASSIC_PAYOFF.S}  both-D=${CLASSIC_PAYOFF.P}`,
    ),
  );

  // Single highlighted match: --a tft --b alld
  if (args.a && args.b) {
    const m = await runMatch(resolve(args.a), resolve(args.b), {
      rounds,
      seed,
    });
    printMatch(m);
    return;
  }

  // Otherwise a full round-robin tournament.
  // Default field is the classic line-up; --strategies overrides; --models adds LLMs.
  const picked = args.strategies
    ? args.strategies.split(",").map((s) => resolve(s.trim()))
    : [...CLASSIC_STRATEGIES];
  if (args.models) {
    for (const spec of args.models
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)) {
      picked.push(pdStrategyFromSpec(spec));
    }
  }

  console.log(pc.dim(`  field   ${picked.map((s) => s.name).join(", ")}\n`));

  const { standings } = await runTournament(picked, {
    rounds,
    seed,
    includeSelf,
  });

  console.log(pc.bold("  Leaderboard (total points across all matches):\n"));
  const nameW = Math.max(...standings.map((s) => s.name.length), 8);
  standings.forEach((s, i) => {
    const rank = `${i + 1}.`.padStart(3);
    const name = s.name.padEnd(nameW);
    const total = String(s.total).padStart(5);
    const avg = s.avgPerRound.toFixed(2);
    const rec = pc.dim(`W${s.wins} L${s.losses} D${s.draws}`);
    const line = `  ${rank} ${name}  ${total}   ${pc.dim(`(avg ${avg}/round)`)}  ${rec}`;
    console.log(i === 0 ? pc.bold(pc.green(line)) : line);
  });
  console.log("");
}

main().catch((err) => {
  console.error(pc.red(String(err?.stack ?? err)));
  process.exit(1);
});

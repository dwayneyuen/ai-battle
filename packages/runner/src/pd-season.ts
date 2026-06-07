import { runMatch, type MatchResult } from "@ai-battle/engine";
import {
  SeasonAgent,
  type OwnMatchLog,
  type StandingLine,
} from "@ai-battle/models";
import {
  recordPdSeason,
  type PdGenerationInput,
  type PdMatchInput,
} from "@ai-battle/db";
import pc from "picocolors";

/**
 * AI Battle — Prisoner's Dilemma SEASON runner.
 *
 * Each model declares an opening strategy, then plays a round robin against every
 * other model (one match each). After every match it reflects; after every round
 * robin it reviews its OWN results and revises its strategy and notebook. This
 * repeats for several generations. Reasoning is captured at three levels — per
 * round, per match, per generation — and the whole season is persisted (when a
 * DATABASE_URL is set) for step-through replay.
 *
 *   pnpm pd:season                                   # 3 generations of mock players
 *   pnpm pd:season --models "openai:gpt-5-mini,google:gemini-2.5-flash"
 *   pnpm pd:season --rounds 10 --generations 5 --models "anthropic:claude-haiku-4-5,deepseek:deepseek-chat"
 */

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

const moveC = (m: "C" | "D") => (m === "C" ? pc.green(m) : pc.red(m));
const provider = (spec: string) =>
  spec === "mock" || spec.startsWith("mock:") ? "mock" : spec.split(":")[0];

/** One sentence preview of a (possibly long) strategy/notebook string. */
function preview(text: string, max = 140): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

async function main() {
  const { args, flags } = parseArgs(process.argv.slice(2));
  const rounds = Number(args.rounds ?? 10);
  const generations = Number(args.generations ?? 3);
  const seed = args.seed ? Number(args.seed) : 1;
  const hideThoughts = flags.has("hide-thoughts");

  // Field: distinct model specs (default: three mock players so it runs keyless).
  const specs = (
    args.models ? args.models.split(",") : ["mock:a", "mock:b", "mock:c"]
  )
    .map((s) => s.trim())
    .filter(Boolean);
  const uniqueSpecs = [...new Set(specs)];
  if (uniqueSpecs.length !== specs.length) {
    console.log(
      pc.yellow(
        "  note: duplicate model specs were dropped (each is one competitor).",
      ),
    );
  }
  if (uniqueSpecs.length < 2) {
    throw new Error(
      "A season needs at least 2 distinct models. Pass --models a,b,...",
    );
  }

  const agents = uniqueSpecs.map((spec) => new SeasonAgent(spec, spec));
  const labelOf = new Map(agents.map((a) => [a.spec, a.label]));

  console.log(pc.bold(pc.cyan(`\n  AI BATTLE — Prisoner's Dilemma SEASON`)));
  console.log(
    pc.dim(
      `  ${agents.length} models · ${generations} generations · ${rounds} rounds/match`,
    ),
  );
  console.log(pc.dim(`  field   ${uniqueSpecs.join(", ")}\n`));

  // Cumulative season totals per spec, and the data we persist at the end.
  const total = new Map<string, number>(uniqueSpecs.map((s) => [s, 0]));
  const genInputs: PdGenerationInput[] = [];

  // 1) Opening declarations (level "initial").
  console.log(pc.bold("  Opening declarations:"));
  const initialDeclarations: {
    spec: string;
    strategy: string;
    thoughts: string;
  }[] = [];
  for (const agent of agents) {
    const opponents = agents.filter((x) => x !== agent).map((x) => x.label);
    const d = await agent.declareInitial(rounds, opponents);
    initialDeclarations.push({ spec: agent.spec, ...d });
    console.log(`    ${pc.bold(agent.label)}: ${pc.dim(preview(d.strategy))}`);
  }
  console.log("");

  // 2) Generations: round robin, per-match reflection, then per-generation revision.
  for (let g = 0; g < generations; g++) {
    console.log(
      pc.bold(pc.cyan(`  ── Generation ${g + 1} / ${generations} ──`)),
    );

    const matches: PdMatchInput[] = [];
    // Per-agent record of its own matches THIS generation (raw logs for reflection).
    const ownLogs = new Map<string, OwnMatchLog[]>(
      uniqueSpecs.map((s) => [s, []]),
    );

    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const a = agents[i];
        const b = agents[j];
        const matchSeed = seed + g * 100_000 + i * 1000 + j;
        const result: MatchResult = await runMatch(
          a.strategyForMatch(b.label, g + 1),
          b.strategyForMatch(a.label, g + 1),
          { rounds, seed: matchSeed },
        );

        total.set(a.spec, (total.get(a.spec) ?? 0) + result.scoreA);
        total.set(b.spec, (total.get(b.spec) ?? 0) + result.scoreB);

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
        ownLogs.get(a.spec)!.push(logA);
        ownLogs.get(b.spec)!.push(logB);

        // Per-match reflection (level "match"), one per seat.
        const [reflA, reflB] = await Promise.all([
          a.reflectOnMatch(logA),
          b.reflectOnMatch(logB),
        ]);

        const tape = result.rounds
          .map((r) => `${moveC(r.a)}${moveC(r.b)}`)
          .join(" ");
        console.log(
          `    ${a.label} ${pc.dim("vs")} ${b.label}  ${pc.dim(
            `${result.scoreA}-${result.scoreB}`,
          )}   ${tape}`,
        );

        matches.push({
          aSpec: a.spec,
          bSpec: b.spec,
          seed: String(matchSeed),
          scoreA: result.scoreA,
          scoreB: result.scoreB,
          rounds: result.rounds.map((r, idx) => ({
            idx,
            moveA: r.a,
            moveB: r.b,
            scoreA: r.scoreA,
            scoreB: r.scoreB,
            thoughtsA: r.thoughtsA,
            thoughtsB: r.thoughtsB,
          })),
          reflections: [
            { spec: a.spec, thoughts: reflA },
            { spec: b.spec, thoughts: reflB },
          ],
        });
      }
    }

    // Standings snapshot after this generation.
    const standings: { spec: string; label: string; total: number }[] =
      uniqueSpecs
        .map((spec) => ({
          spec,
          label: labelOf.get(spec)!,
          total: total.get(spec)!,
        }))
        .sort((x, y) => y.total - x.total);
    const standingLines: StandingLine[] = standings.map((s) => ({
      label: s.label,
      total: s.total,
    }));

    console.log(
      pc.dim(
        `    standings: ${standings.map((s) => `${s.label} ${s.total}`).join("  ")}`,
      ),
    );

    // 3) Between-generation revision (level "generation").
    const generationReflections: PdGenerationInput["generationReflections"] =
      [];
    for (const agent of agents) {
      const r = await agent.reflectOnGeneration(
        g + 1,
        ownLogs.get(agent.spec)!,
        standingLines,
      );
      generationReflections.push({ spec: agent.spec, ...r });
      if (!hideThoughts) {
        console.log(
          `      ${pc.bold(agent.label)} revises → ${pc.dim(preview(r.strategy, 110))}`,
        );
      }
    }
    console.log("");

    genInputs.push({ idx: g, matches, generationReflections, standings });
  }

  // Final leaderboard.
  const final = uniqueSpecs
    .map((spec) => ({ label: labelOf.get(spec)!, total: total.get(spec)! }))
    .sort((x, y) => y.total - x.total);
  console.log(pc.bold("  Final season standings (total points):\n"));
  const nameW = Math.max(...final.map((s) => s.label.length), 8);
  final.forEach((s, i) => {
    const line = `  ${`${i + 1}.`.padStart(3)} ${s.label.padEnd(nameW)}  ${String(
      s.total,
    ).padStart(6)}`;
    console.log(i === 0 ? pc.bold(pc.green(line)) : line);
  });
  console.log("");

  // 4) Persist (skipped without a database, so the demo stays keyless/dbless).
  if (flags.has("no-persist") || !process.env.DATABASE_URL) {
    console.log(
      pc.dim(
        flags.has("no-persist")
          ? "  (persistence skipped: --no-persist)"
          : "  (persistence skipped: set DATABASE_URL to store the season)",
      ),
    );
    return;
  }
  try {
    const id = await recordPdSeason({
      config: { rounds, generations, seed, field: uniqueSpecs },
      players: uniqueSpecs.map((spec) => ({
        spec,
        label: labelOf.get(spec)!,
        provider: provider(spec),
      })),
      initialDeclarations,
      generations: genInputs,
    });
    console.log(pc.green(`  Saved season ${id}\n`));
  } catch (err) {
    console.error(
      pc.red(`  Failed to persist season: ${(err as Error).message}\n`),
    );
  }
}

main().catch((err) => {
  console.error(pc.red(String(err?.stack ?? err)));
  process.exit(1);
});

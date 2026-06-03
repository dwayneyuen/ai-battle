import { runMafia, type GameEvent, type MafiaConfig } from "@ai-battle/engine";
import { agentFromSpec } from "@ai-battle/models";
import pc from "picocolors";

const NAMES = [
  "Alice",
  "Bob",
  "Carol",
  "Dave",
  "Erin",
  "Frank",
  "Grace",
  "Heidi",
  "Ivan",
  "Judy",
];

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

function colorFor(e: GameEvent): (s: string) => string {
  switch (e.type) {
    case "game-start":
    case "result":
      return (s) => pc.bold(pc.green(s));
    case "night-falls":
      return (s) => pc.blue(s);
    case "day-breaks":
    case "no-death":
      return (s) => pc.yellow(s);
    case "death":
    case "elimination":
      return (s) => pc.bold(pc.red(s));
    case "statement":
      return (s) => pc.white(s);
    case "vote":
      return (s) => pc.magenta(s);
    case "thought":
    case "role-assigned":
    case "investigation":
    case "mafia-target":
      return (s) => pc.dim(pc.gray(s));
    default:
      return (s) => s;
  }
}

async function main() {
  const { args, flags } = parseArgs(process.argv.slice(2));
  const playerCount = Math.min(Number(args.players ?? 7), NAMES.length);
  const seed = args.seed ? Number(args.seed) : undefined;
  const discussionRounds = args.rounds ? Number(args.rounds) : 1;
  const showPrivate = !flags.has("hide-private");

  // Model assignment: --models "anthropic:claude-opus-4-8,openai:gpt-5,..."
  // Any seats not covered fall back to the free mock agent.
  const specs = (args.models ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const players = Array.from({ length: playerCount }, (_, i) => ({
    id: `p${i + 1}`,
    name: NAMES[i],
  }));

  const agents: Record<string, ReturnType<typeof agentFromSpec>> = {};
  players.forEach((p, i) => {
    const spec = specs[i] ?? "mock";
    agents[p.id] = agentFromSpec(spec, p.name);
  });

  const config: MafiaConfig = {
    players,
    roles: { mafia: playerCount >= 7 ? 2 : 1, doctor: 1, detective: 1 },
    seed,
    discussionRounds,
    revealRolesOnDeath: true,
  };

  console.log(pc.bold(pc.cyan("\n  AI BATTLE — Mafia\n")));
  console.log(
    pc.dim(
      `  ${players
        .map((p, i) => `${p.name}=${specs[i] ?? "mock"}`)
        .join("  ")}\n`,
    ),
  );

  await runMafia(config, agents, (e) => {
    const isPrivate = Boolean(e.visibleTo);
    if (isPrivate && !showPrivate) return;
    const prefix = isPrivate ? pc.dim("  · ") : "  ";
    console.log(prefix + colorFor(e)(e.message));
  });

  console.log("");
}

main().catch((err) => {
  console.error(pc.red(String(err?.stack ?? err)));
  process.exit(1);
});

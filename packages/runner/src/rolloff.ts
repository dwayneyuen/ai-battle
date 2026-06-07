import { runRollOff } from "@ai-battle/engine";
import { mockRollOffAgent, rollOffAgentFromSpec } from "@ai-battle/models";
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
      } else flags.add(key);
    }
  }
  return { args, flags };
}

async function main() {
  const { args, flags } = parseArgs(process.argv.slice(2));
  const playerCount = Math.max(2, Number(args.players ?? 6));
  const games = Number(args.games ?? 2000);
  const target = args.target ? Number(args.target) : undefined;
  const seed = args.seed ? Number(args.seed) : 12345;
  const specs = args.models
    ? args.models
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : null;
  const verbose = flags.has("verbose") || Boolean(specs);

  // --- Single game (watch it play), optionally with real models -----------
  if (verbose) {
    const seats = (specs ?? Array(playerCount).fill("mock")).map((s, i) => ({
      id: `p${i + 1}`,
      name: specs ? s.replace(/^.*:/, "") : `P${i + 1}`,
      spec: s,
    }));
    const agents = Object.fromEntries(
      seats.map((s) => [s.id, rollOffAgentFromSpec(s.spec, s.name)]),
    );
    console.log(pc.bold(pc.cyan("\n  ROLL-OFF — single game\n")));
    const result = await runRollOff(
      { players: seats.map((s) => ({ id: s.id, name: s.name })), target, seed },
      agents,
      (e) => console.log("  " + pc.dim(e.message)),
    );
    console.log(
      pc.bold(
        pc.green(
          `\n  Winner: ${result.winnerName ?? "draw"} — ${result.reason}\n`,
        ),
      ),
    );
    return;
  }

  // --- Smoke test: are wins uniform across seats? -------------------------
  console.log(
    pc.bold(
      pc.cyan(
        `\n  ROLL-OFF — uniformity smoke test (${games} games, ${playerCount} seats)\n`,
      ),
    ),
  );
  const wins = new Array(playerCount).fill(0);
  let draws = 0;
  for (let g = 0; g < games; g++) {
    const players = Array.from({ length: playerCount }, (_, i) => ({
      id: `p${i + 1}`,
      name: `P${i + 1}`,
    }));
    const agents = Object.fromEntries(
      players.map((p) => [p.id, mockRollOffAgent(p.name)]),
    );
    const result = await runRollOff(
      { players, target, seed: seed + g },
      agents,
    );
    if (result.winner === null) draws++;
    else wins[players.findIndex((p) => p.id === result.winner)]++;
  }

  // Each seat should win 1/N of the time. Flag big deviations (z-score).
  const expected = games / playerCount;
  const sd = Math.sqrt(expected * (1 - 1 / playerCount));
  let chi2 = 0;
  let maxZ = 0;
  console.log(
    pc.dim(`  expected per seat: ${expected.toFixed(1)}  (1/${playerCount})\n`),
  );
  wins.forEach((w, i) => {
    const z = (w - expected) / sd;
    chi2 += (w - expected) ** 2 / expected;
    maxZ = Math.max(maxZ, Math.abs(z));
    const pct = ((100 * w) / games).toFixed(1);
    const flag = Math.abs(z) > 4 ? pc.red(" ⚠") : "";
    console.log(
      `  P${String(i + 1).padEnd(2)} ${String(w).padStart(6)}  ${pct.padStart(5)}%  (z=${z.toFixed(2)})${flag}`,
    );
  });
  const pass = maxZ < 4 && draws === 0;
  console.log(
    `\n  draws: ${draws}   chi²=${chi2.toFixed(1)} (df=${playerCount - 1})   max|z|=${maxZ.toFixed(2)}`,
  );
  console.log(
    pass
      ? pc.bold(
          pc.green("\n  PASS — wins look uniform; the harness is symmetric.\n"),
        )
      : pc.bold(
          pc.red("\n  WARN — a seat deviates; possible simulation bug.\n"),
        ),
  );
  if (!pass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(pc.red(String(err?.stack ?? err)));
  process.exit(1);
});

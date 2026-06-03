import {
  GAMES,
  GAME_FEATURE_LABELS,
  PROVIDERS,
  type GameInfo,
} from "@ai-battle/catalog";
import pc from "picocolors";

const yes = pc.green("✓");
const no = pc.dim("·");

function gameLine(g: GameInfo) {
  const status =
    g.status === "playable" ? pc.green("playable") : pc.yellow("planned ");
  const players =
    g.players.min === g.players.max
      ? `${g.players.min}p`
      : `${g.players.min}-${g.players.max}p`;
  const feats = GAME_FEATURE_LABELS.map(
    (f) => `${g.features[f.key] ? yes : no} ${pc.dim(f.label)}`,
  ).join("  ");
  console.log(
    `  ${pc.bold(g.name.padEnd(20))} ${status}  ${pc.dim(players.padStart(5))}`,
  );
  console.log(`    ${feats}`);
  if (g.notSupported.length) {
    console.log(pc.dim(`    not yet: ${g.notSupported.join("; ")}`));
  }
  console.log("");
}

function main() {
  console.log(pc.bold(pc.cyan("\n  AI BATTLE — Catalog\n")));

  console.log(pc.bold("  GAMES\n"));
  for (const g of GAMES) gameLine(g);

  console.log(pc.bold("  MODELS / PROVIDERS\n"));
  for (const p of PROVIDERS) {
    const cost =
      p.cost === "free"
        ? pc.green("free ")
        : p.cost === "cheap"
          ? pc.blue("cheap")
          : pc.dim("paid ");
    const free = p.freeTier ? yes : no;
    console.log(
      `  ${pc.bold(p.name.padEnd(18))} ${cost}  free-path ${free}  ${pc.dim(
        p.exampleSpec,
      )}`,
    );
  }
  console.log("");
}

main();

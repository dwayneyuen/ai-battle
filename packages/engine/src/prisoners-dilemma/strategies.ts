import type { Move, Strategy } from "./types";

const C: Move = "C";
const D: Move = "D";
const last = (a: readonly Move[]): Move => a[a.length - 1];

/** The naive optimist — cooperates no matter what. Easy prey for cheats. */
export const alwaysCooperate: Strategy = {
  name: "Always Cooperate",
  description: "Cooperates every round, regardless of what happens.",
  next: () => C,
};

/** The relentless cheat ("ALL D") — always defects. */
export const alwaysDefect: Strategy = {
  name: "Always Defect",
  description: "Defects every round, exploiting anyone who cooperates.",
  next: () => D,
};

/**
 * Tit for Tat — cooperate first, then echo the opponent's last move. Nice,
 * retaliatory, forgiving, and clear; the winner of Axelrod's tournaments and
 * the star of "The Selfish Gene".
 */
export const titForTat: Strategy = {
  name: "Tit for Tat",
  description:
    "Cooperates first, then copies the opponent's previous move. Axelrod's winner.",
  next: ({ oppMoves }) => (oppMoves.length === 0 ? C : last(oppMoves)),
};

/**
 * Tit for Two Tats — only retaliates after two defections in a row. More
 * forgiving than Tit for Tat; Dawkins notes it might have won had it been
 * entered.
 */
export const titForTwoTats: Strategy = {
  name: "Tit for Two Tats",
  description:
    "Defects only after the opponent defects twice in a row; very forgiving.",
  next: ({ oppMoves }) => {
    const n = oppMoves.length;
    return n >= 2 && oppMoves[n - 1] === D && oppMoves[n - 2] === D ? D : C;
  },
};

/** Suspicious Tit for Tat — Tit for Tat that opens with a defection. */
export const suspiciousTitForTat: Strategy = {
  name: "Suspicious Tit for Tat",
  description: "Like Tit for Tat, but opens with a defection instead of trust.",
  next: ({ oppMoves }) => (oppMoves.length === 0 ? D : last(oppMoves)),
};

/** Grudger (Friedman) — cooperates until the first defection, then never forgives. */
export const grudger: Strategy = {
  name: "Grudger",
  description:
    "Cooperates until the opponent defects once, then defects forever after.",
  next: ({ oppMoves }) => (oppMoves.includes(D) ? D : C),
};

/**
 * Pavlov (Win-Stay, Lose-Shift) — repeat the last move after a good payoff
 * (opponent cooperated), switch after a bad one (opponent defected).
 */
export const pavlov: Strategy = {
  name: "Pavlov",
  description:
    "Win-stay, lose-shift: repeats its move after a good round, switches after a bad one.",
  next: ({ myMoves, oppMoves }) => {
    if (myMoves.length === 0) return C;
    const won = last(oppMoves) === C; // got Reward or Temptation
    const mine = last(myMoves);
    return won ? mine : mine === C ? D : C;
  },
};

/** Random — cooperates or defects with equal probability. */
export const random: Strategy = {
  name: "Random",
  description: "Cooperates or defects 50/50 at random.",
  next: ({ rand }) => (rand() < 0.5 ? C : D),
};

/**
 * Joss — a "sneaky" Tit for Tat: usually copies the opponent, but defects 10%
 * of the time when it would otherwise cooperate. Its sneakiness tends to start
 * mutual-defection feuds.
 */
export const joss: Strategy = {
  name: "Joss",
  description:
    "Sneaky Tit for Tat: copies the opponent, but defects 10% of the time it would cooperate.",
  next: ({ oppMoves, rand }) => {
    const base: Move = oppMoves.length === 0 ? C : last(oppMoves);
    return base === C && rand() < 0.1 ? D : base;
  },
};

/** The classic Axelrod / "Selfish Gene" line-up, in a sensible display order. */
export const CLASSIC_STRATEGIES: Strategy[] = [
  titForTat,
  titForTwoTats,
  grudger,
  pavlov,
  suspiciousTitForTat,
  joss,
  alwaysCooperate,
  alwaysDefect,
  random,
];

/** Short keys for selecting strategies on the command line. */
export const STRATEGIES_BY_KEY: Record<string, Strategy> = {
  tft: titForTat,
  tf2t: titForTwoTats,
  grudger: grudger,
  pavlov: pavlov,
  stft: suspiciousTitForTat,
  joss: joss,
  allc: alwaysCooperate,
  alld: alwaysDefect,
  random: random,
};

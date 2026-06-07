import { mulberry32 } from "../rng";
import { TransportError, type GameEvent, type ModelCall } from "../mafia/types";
import type {
  RollOffAction,
  RollOffAgent,
  RollOffConfig,
  RollOffContext,
  RollOffResult,
} from "./types";

/**
 * Runs one Roll-Off game. Each round, every active player is asked (in parallel)
 * to predict a die roll; the harness then rolls a fair die for each — the
 * prediction is logged but never used, so the game is pure luck and perfectly
 * symmetric. An invalid prediction forfeits that seat. First to `target` wins;
 * simultaneous reaches are broken uniformly at random (preserving the 1/N
 * symmetry that makes this a useful smoke test).
 */
export async function runRollOff(
  config: RollOffConfig,
  agents: Record<string, RollOffAgent>,
  onEvent: (e: GameEvent) => void = () => {},
  onModelCall: (c: ModelCall) => void = () => {},
): Promise<RollOffResult> {
  const rand = mulberry32(config.seed ?? (Math.random() * 2 ** 32) >>> 0);
  const target = config.target ?? 20;
  const maxRounds = config.maxRounds ?? 500;

  const players = config.players.map((p) => ({
    id: p.id,
    name: p.name,
    score: 0,
    forfeited: false,
  }));
  const events: GameEvent[] = [];
  let round = 0;

  function emit(e: Omit<GameEvent, "day" | "phase">) {
    const full: GameEvent = { ...e, day: round, phase: "roll" };
    events.push(full);
    onEvent(full);
  }

  const active = () => players.filter((p) => !p.forfeited);

  emit({
    type: "game-start",
    message: `Roll-Off: ${players.length} players race to ${target}. Pure luck — every player should win equally often.`,
    data: { target, players: players.map((p) => ({ id: p.id, name: p.name })) },
  });

  let winner: (typeof players)[number] | null = null;
  let reason = "";

  for (round = 1; round <= maxRounds; round++) {
    const act = active();
    if (act.length === 0) {
      reason = "everyone forfeited";
      break;
    }
    if (act.length === 1) {
      winner = act[0];
      reason = `${act[0].name} is the last player standing`;
      break;
    }

    // Ask every active player to predict, in parallel.
    const decisions = await Promise.all(
      act.map(async (p) => {
        const ctx: RollOffContext = {
          you: p.name,
          round,
          yourScore: p.score,
          scores: act.map((q) => ({ name: q.name, score: q.score })),
          target,
          history: events.slice(-12).map((e) => e.message),
          prompt: "Predict your next die roll — an integer from 1 to 6.",
        };
        let action: RollOffAction;
        try {
          action = await agents[p.id].decide(ctx);
        } catch (err) {
          if (err instanceof TransportError) throw err; // void the match
          action = {}; // any other throw = invalid response = forfeit
        }
        return { p, action };
      }),
    );

    // Resolve each: log the call, forfeit on invalid, otherwise roll.
    for (const { p, action } of decisions) {
      const prediction = action.prediction;
      const valid =
        typeof prediction === "number" &&
        Number.isInteger(prediction) &&
        prediction >= 1 &&
        prediction <= 6;

      if (action.diagnostics) {
        onModelCall({
          seatId: p.id,
          seatName: p.name,
          decisionType: "predict",
          day: round,
          phase: "roll",
          system: action.diagnostics.system,
          user: action.diagnostics.user,
          raw: action.diagnostics.raw,
          parsed: { prediction },
          thoughts: action.thoughts,
          valid,
          latencyMs: action.diagnostics.latencyMs,
        });
      }

      if (!valid) {
        p.forfeited = true;
        emit({
          type: "forfeit",
          actor: p.id,
          message: `${p.name} forfeits — invalid prediction (${prediction}).`,
          data: { prediction },
        });
        continue;
      }

      const roll = 1 + Math.floor(rand() * 6);
      p.score += roll;
      emit({
        type: "roll",
        actor: p.id,
        message: `${p.name} predicted ${prediction}, rolled ${roll} (total ${p.score})${
          prediction === roll ? " — called it!" : ""
        }`,
        data: { prediction, roll, total: p.score, hit: prediction === roll },
      });
    }

    // Anyone reached the target? Highest score wins; ties broken uniformly.
    const reached = active().filter((p) => p.score >= target);
    if (reached.length > 0) {
      const max = Math.max(...reached.map((p) => p.score));
      const leaders = reached.filter((p) => p.score === max);
      winner = leaders[Math.floor(rand() * leaders.length)];
      reason = `${winner.name} reached ${target}`;
      break;
    }
  }

  if (!winner && active().length === 1) {
    winner = active()[0];
    reason = `${winner.name} is the last player standing`;
  }

  emit({
    type: "result",
    message: winner
      ? `Game over — ${winner.name} wins. ${reason}.`
      : `Game over — draw. ${reason}.`,
    data: {
      winner: winner?.id ?? null,
      scores: players.map((p) => ({ name: p.name, score: p.score })),
    },
  });

  return {
    winner: winner?.id ?? null,
    winnerName: winner?.name ?? null,
    reason,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      forfeited: p.forfeited,
      won: winner != null && p.id === winner.id,
    })),
    events,
  };
}

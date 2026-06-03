import { mulberry32, shuffle } from "../rng.js";
import type {
  ActionResult,
  Agent,
  AgentContext,
  Decision,
  GameEvent,
  GameResult,
  MafiaConfig,
  Phase,
  Player,
  PlayerView,
  Role,
} from "./types.js";

/**
 * Runs a complete game of Mafia, asking each `agent` to make decisions at the
 * appropriate moments. Emits a `GameEvent` for everything that happens so the
 * caller can log it, stream it to spectators, or persist a replay.
 */
export async function runMafia(
  config: MafiaConfig,
  agents: Record<string, Agent>,
  onEvent: (e: GameEvent) => void = () => {},
): Promise<GameResult> {
  const rand = mulberry32(config.seed ?? (Math.random() * 2 ** 32) >>> 0);
  const discussionRounds = config.discussionRounds ?? 1;
  const revealRoles = config.revealRolesOnDeath ?? true;

  const players = assignRoles(config, rand);
  const byId = new Map(players.map((p) => [p.id, p]));
  const events: GameEvent[] = [];

  // Detective investigation results, by detective id -> (target id -> isMafia).
  const investigations = new Map<string, Map<string, boolean>>();

  let day = 0;
  let phase: Phase = "setup";

  function emit(e: Omit<GameEvent, "day" | "phase">) {
    const full: GameEvent = { ...e, day, phase };
    events.push(full);
    onEvent(full);
  }

  const living = () => players.filter((p) => p.alive);
  const livingMafia = () => living().filter((p) => p.role === "mafia");
  const livingTown = () => living().filter((p) => p.role !== "mafia");
  const name = (id: string) => byId.get(id)?.name ?? id;

  // --- Setup ---------------------------------------------------------------
  emit({
    type: "game-start",
    message: `A game of Mafia begins with ${players.length} players: ${players
      .map((p) => p.name)
      .join(", ")}.`,
    data: { players: players.map((p) => ({ id: p.id, name: p.name })) },
  });
  for (const p of players) {
    const allies =
      p.role === "mafia" ? mafiaIds(players).filter((id) => id !== p.id) : [];
    emit({
      type: "role-assigned",
      actor: p.id,
      message:
        `${p.name}, you are the ${p.role.toUpperCase()}.` +
        (allies.length
          ? ` Your mafia partners: ${allies.map(name).join(", ")}.`
          : ""),
      data: { role: p.role, allies },
      visibleTo: [p.id],
    });
  }

  // Builds the knowledge an agent is allowed to use for a decision.
  function contextFor(player: Player, decision: Decision): AgentContext {
    const visibleHistory = events
      .filter((e) => !e.visibleTo || e.visibleTo.includes(player.id))
      .map((e) => e.message);

    const notes: string[] = [];
    if (player.role === "detective") {
      const results = investigations.get(player.id);
      if (results) {
        for (const [target, isMafia] of results) {
          notes.push(
            `You investigated ${name(target)}: ${isMafia ? "MAFIA" : "not mafia"}.`,
          );
        }
      }
    }
    if (player.role === "mafia") {
      const partners = mafiaIds(players).filter((id) => id !== player.id);
      if (partners.length)
        notes.push(`Your mafia partners: ${partners.map(name).join(", ")}.`);
    }

    return {
      you: { id: player.id, name: player.name, role: player.role },
      allies:
        player.role === "mafia"
          ? mafiaIds(players).filter((id) => id !== player.id)
          : [],
      players: players.map<PlayerView>((p) => ({
        id: p.id,
        name: p.name,
        alive: p.alive,
      })),
      day,
      phase,
      history: visibleHistory,
      notes,
      decision,
    };
  }

  // Asks an agent to decide, validating the result and falling back to a random
  // legal move if the model returns something invalid (models sometimes do).
  async function ask(
    player: Player,
    decision: Decision,
  ): Promise<ActionResult> {
    const agent = agents[player.id];
    if (!agent) throw new Error(`No agent registered for player ${player.id}`);
    let result: ActionResult;
    try {
      result = await agent.decide(contextFor(player, decision));
    } catch (err) {
      result = {};
      emit({
        type: "thought",
        actor: player.id,
        message: `(${player.name} errored: ${(err as Error).message})`,
        visibleTo: [player.id],
      });
    }
    if (decision.options.length > 0) {
      if (!result.target || !decision.options.includes(result.target)) {
        const fallback =
          decision.options[Math.floor(rand() * decision.options.length)];
        result = { ...result, target: fallback };
      }
    }
    if (result.reasoning) {
      emit({
        type: "thought",
        actor: player.id,
        message: `${player.name} (thinking): ${result.reasoning}`,
        visibleTo: [player.id],
      });
    }
    return result;
  }

  function checkWinner(): GameResult | null {
    if (livingMafia().length === 0) {
      return finish("town", "All mafia have been eliminated.");
    }
    if (livingMafia().length >= livingTown().length) {
      return finish("mafia", "The mafia equal or outnumber the town.");
    }
    return null;
  }

  function finish(winner: "town" | "mafia", reason: string): GameResult {
    phase = "ended";
    emit({
      type: "result",
      message: `Game over — ${winner.toUpperCase()} wins. ${reason}`,
      data: {
        winner,
        roles: players.map((p) => ({
          id: p.id,
          name: p.name,
          role: p.role,
          alive: p.alive,
        })),
      },
    });
    return {
      winner,
      reason,
      survivors: living().map((p) => p.id),
      players,
      events,
    };
  }

  // --- Main loop -----------------------------------------------------------
  // Safety cap so a misbehaving set of agents can never loop forever.
  for (let guard = 0; guard < players.length * 4 + 10; guard++) {
    day += 1;

    // ----- NIGHT -----
    phase = "night";
    emit({
      type: "night-falls",
      message: `Night ${day} falls. The town sleeps.`,
    });

    // Detective investigates first (so results are available next day).
    for (const det of living().filter((p) => p.role === "detective")) {
      const options = living()
        .filter((p) => p.id !== det.id)
        .map((p) => p.id);
      const res = await ask(det, {
        type: "detective-investigate",
        prompt:
          "Choose one player to investigate tonight. You will learn if they are mafia.",
        options,
        allowText: false,
      });
      const target = res.target!;
      const isMafia = byId.get(target)!.role === "mafia";
      if (!investigations.has(det.id)) investigations.set(det.id, new Map());
      investigations.get(det.id)!.set(target, isMafia);
      emit({
        type: "investigation",
        actor: det.id,
        target,
        message: `You investigated ${name(target)} — they are ${isMafia ? "MAFIA" : "NOT mafia"}.`,
        visibleTo: [det.id],
      });
    }

    // Doctor protects.
    let protectedId: string | undefined;
    for (const doc of living().filter((p) => p.role === "doctor")) {
      const options = living().map((p) => p.id);
      const res = await ask(doc, {
        type: "doctor-save",
        prompt:
          "Choose one player to protect from the mafia tonight (you may protect yourself).",
        options,
        allowText: false,
      });
      protectedId = res.target;
      emit({
        type: "thought",
        actor: doc.id,
        message: `You chose to protect ${name(protectedId!)} tonight.`,
        visibleTo: [doc.id],
      });
    }

    // Mafia choose a victim (each votes; plurality wins).
    const mafiaVotes: string[] = [];
    for (const m of livingMafia()) {
      const options = living()
        .filter((p) => p.role !== "mafia")
        .map((p) => p.id);
      const res = await ask(m, {
        type: "mafia-kill",
        prompt: "Choose one player for the mafia to kill tonight.",
        options,
        allowText: false,
      });
      mafiaVotes.push(res.target!);
      emit({
        type: "mafia-target",
        actor: m.id,
        target: res.target,
        message: `${m.name} votes to kill ${name(res.target!)}.`,
        visibleTo: mafiaIds(players),
      });
    }
    const victim = plurality(mafiaVotes, rand);

    // ----- DAY: resolve the night -----
    phase = "day-discussion";
    if (victim && victim !== protectedId) {
      byId.get(victim)!.alive = false;
      emit({
        type: "death",
        target: victim,
        message:
          `Day ${day} breaks. ${name(victim)} was found dead.` +
          (revealRoles
            ? ` They were the ${byId.get(victim)!.role.toUpperCase()}.`
            : ""),
        data: { role: byId.get(victim)!.role },
      });
    } else {
      emit({
        type: "no-death",
        message: `Day ${day} breaks. To everyone's relief, no one died last night.`,
      });
    }

    let result = checkWinner();
    if (result) return result;

    // ----- DAY: discussion -----
    emit({
      type: "day-breaks",
      message: "The town gathers to discuss who among them is mafia.",
    });
    for (let round = 0; round < discussionRounds; round++) {
      for (const p of living()) {
        const res = await ask(p, {
          type: "statement",
          prompt:
            "Make a short public statement to the town. Share suspicions, defend yourself, " +
            "or try to steer the vote. Everyone (including the mafia) hears this.",
          options: [],
          allowText: true,
        });
        const text = (res.text ?? "").trim() || "(says nothing)";
        emit({
          type: "statement",
          actor: p.id,
          message: `${p.name}: "${text}"`,
        });
      }
    }

    // ----- DAY: vote -----
    phase = "day-vote";
    const votes: string[] = [];
    for (const p of living()) {
      const options = living()
        .filter((q) => q.id !== p.id)
        .map((q) => q.id);
      const res = await ask(p, {
        type: "vote",
        prompt:
          "Vote to eliminate one player. The player with the most votes is eliminated.",
        options,
        allowText: false,
      });
      votes.push(res.target!);
      emit({
        type: "vote",
        actor: p.id,
        target: res.target,
        message: `${p.name} votes to eliminate ${name(res.target!)}.`,
      });
    }
    const eliminated = plurality(votes, rand, /*requireMajorityTieBreak*/ true);
    if (eliminated) {
      byId.get(eliminated)!.alive = false;
      emit({
        type: "elimination",
        target: eliminated,
        message:
          `The town votes out ${name(eliminated)}.` +
          (revealRoles
            ? ` They were the ${byId.get(eliminated)!.role.toUpperCase()}.`
            : ""),
        data: { role: byId.get(eliminated)!.role },
      });
    } else {
      emit({
        type: "no-death",
        message: "The vote is tied — no one is eliminated today.",
      });
    }

    result = checkWinner();
    if (result) return result;
  }

  // Reached only if the safety cap trips (should not happen in normal play).
  return finish(
    livingMafia().length >= livingTown().length ? "mafia" : "town",
    "Game ended (turn limit reached).",
  );
}

// --- helpers ---------------------------------------------------------------

function assignRoles(config: MafiaConfig, rand: () => number): Player[] {
  const { players, roles } = config;
  const roleList: Role[] = [
    ...Array<Role>(roles.mafia).fill("mafia"),
    ...Array<Role>(roles.doctor).fill("doctor"),
    ...Array<Role>(roles.detective).fill("detective"),
  ];
  while (roleList.length < players.length) roleList.push("villager");
  if (roleList.length > players.length) {
    throw new Error(
      `Too many special roles (${roleList.length}) for ${players.length} players.`,
    );
  }
  const shuffled = shuffle(roleList, rand);
  return players.map((p, i) => ({
    id: p.id,
    name: p.name,
    role: shuffled[i],
    alive: true,
  }));
}

function mafiaIds(players: Player[]): string[] {
  return players.filter((p) => p.role === "mafia").map((p) => p.id);
}

/** Returns the most-voted id. Ties broken randomly, unless a tie should be a no-op. */
function plurality(
  votes: string[],
  rand: () => number,
  tieIsNoOp = false,
): string | undefined {
  if (votes.length === 0) return undefined;
  const tally = new Map<string, number>();
  for (const v of votes) tally.set(v, (tally.get(v) ?? 0) + 1);
  let max = 0;
  for (const c of tally.values()) max = Math.max(max, c);
  const leaders = [...tally.entries()]
    .filter(([, c]) => c === max)
    .map(([id]) => id);
  if (leaders.length > 1 && tieIsNoOp) return undefined;
  return leaders[Math.floor(rand() * leaders.length)];
}

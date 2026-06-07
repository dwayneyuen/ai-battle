import { mulberry32, shuffle } from "../rng.js";
import {
  TransportError,
  type ActionResult,
  type Agent,
  type AgentContext,
  type Decision,
  type DiscussionConfig,
  type Forfeit,
  type GameEvent,
  type GameResult,
  type MafiaConfig,
  type Phase,
  type Player,
  type PlayerView,
  type Role,
} from "./types.js";

const DEFAULT_DISCUSSION: DiscussionConfig = {
  maxMessages: 24,
  perPlayer: 4,
  maxUrgency: 3,
};
const DEFAULT_MAFIA_CHAT: DiscussionConfig = {
  maxMessages: 6,
  perPlayer: 3,
  maxUrgency: 3,
};

/**
 * Runs a complete game of Mafia. Daytime discussion uses a "volunteer loop":
 * each tick every living player privately bids how badly they want to speak,
 * and the keenest gets the floor — so conversation is emergent rather than a
 * fixed round-robin. A model that returns an invalid/illegal response forfeits
 * immediately (it is removed and recorded); a transport failure voids the match.
 */
export async function runMafia(
  config: MafiaConfig,
  agents: Record<string, Agent>,
  onEvent: (e: GameEvent) => void = () => {},
): Promise<GameResult> {
  const rand = mulberry32(config.seed ?? (Math.random() * 2 ** 32) >>> 0);
  const revealRoles = config.revealRolesOnDeath ?? true;
  const discussionCfg = { ...DEFAULT_DISCUSSION, ...config.discussion };
  const mafiaChatCfg = { ...DEFAULT_MAFIA_CHAT, ...config.mafiaChat };

  const players = assignRoles(config, rand);
  const byId = new Map(players.map((p) => [p.id, p]));
  const events: GameEvent[] = [];
  const forfeits: Forfeit[] = [];

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
      .filter((e) => e.type !== "role-assigned" && e.type !== "bid")
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

  // Validate a model's response against the decision. Returns the cleaned
  // action, or a reason it is invalid (which triggers a forfeit).
  function validate(
    result: ActionResult,
    decision: Decision,
  ): { ok: true; value: ActionResult } | { ok: false; reason: string } {
    if (decision.type === "bid") {
      const u = result.urgency;
      if (typeof u !== "number" || !Number.isFinite(u)) {
        return { ok: false, reason: "bid did not return a numeric urgency" };
      }
      const clamped = Math.max(
        0,
        Math.min(decision.maxUrgency ?? 3, Math.round(u)),
      );
      return {
        ok: true,
        value: { urgency: clamped, reasoning: result.reasoning },
      };
    }
    if (decision.options.length > 0) {
      if (!result.target || !decision.options.includes(result.target)) {
        return {
          ok: false,
          reason: `chose "${result.target ?? "nothing"}", not a legal target`,
        };
      }
      return { ok: true, value: result };
    }
    // Free-text statement: anything (including silence) is acceptable.
    return { ok: true, value: result };
  }

  // Ask one agent for one decision. Throws TransportError (→ void match) on
  // infrastructure failure; returns ok:false on an invalid response (→ forfeit).
  async function ask(
    player: Player,
    decision: Decision,
  ): Promise<
    | { ok: true; result: ActionResult }
    | { ok: false; reason: string; raw?: string }
  > {
    const agent = agents[player.id];
    if (!agent) throw new Error(`No agent registered for player ${player.id}`);
    let result: ActionResult;
    try {
      result = await agent.decide(contextFor(player, decision));
    } catch (err) {
      if (err instanceof TransportError) throw err; // bubble up → runner voids match
      return { ok: false, reason: `agent error: ${(err as Error).message}` };
    }
    const v = validate(result, decision);
    if (!v.ok)
      return { ok: false, reason: v.reason, raw: JSON.stringify(result) };
    if (v.value.reasoning) {
      emit({
        type: "thought",
        actor: player.id,
        message: `${player.name} (thinking): ${v.value.reasoning}`,
        visibleTo: [player.id],
      });
    }
    return { ok: true, result: v.value };
  }

  // Remove a player who broke the protocol, and record it.
  function forfeit(
    player: Player,
    decision: Decision,
    reason: string,
    raw?: string,
  ) {
    player.alive = false;
    player.forfeited = true;
    forfeits.push({
      id: player.id,
      name: player.name,
      decisionType: decision.type,
      reason,
      raw,
      day,
    });
    emit({
      type: "forfeit",
      actor: player.id,
      message: `${player.name} forfeits and is removed — ${reason}.`,
      data: { decisionType: decision.type, reason },
    });
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
          forfeited: p.forfeited ?? false,
        })),
      },
    });
    return {
      winner,
      reason,
      survivors: living().map((p) => p.id),
      players,
      events,
      forfeits,
    };
  }

  // --- The volunteer-loop discussion --------------------------------------
  // Each tick: poll eligible players in parallel for an urgency bid; give the
  // floor to the keenest (tiebreak: who has spoken least, then random); that
  // player speaks. Ends when everyone passes or a cap is hit. Returns a
  // GameResult only if a mid-discussion forfeit ends the game.
  async function runDiscussion(
    participants: Player[],
    visibleTo: string[] | undefined,
    cfg: DiscussionConfig,
    audience: "town" | "mafia",
  ): Promise<GameResult | null> {
    const spoken = new Map<string, number>();
    const bidPrompt =
      audience === "mafia"
        ? "Your fellow mafia are scheming. How urgently do you want to speak now?"
        : "The town is debating who is mafia. How urgently do you want to speak now?";
    const sayPrompt =
      audience === "mafia"
        ? "You have the floor with your mafia partners. Coordinate quietly — who to kill, how to cover. Only mafia hear this."
        : "You have the floor. Make a short public statement — accuse, defend, or steer the vote. Everyone hears this.";

    for (let tick = 0; tick < cfg.maxMessages; tick++) {
      const eligible = participants.filter(
        (p) => p.alive && (spoken.get(p.id) ?? 0) < cfg.perPlayer,
      );
      if (eligible.length === 0) break;

      // 1) BID — poll everyone in parallel ("raise your hand").
      const bidDecision: Decision = {
        type: "bid",
        prompt: `${bidPrompt} Reply with urgency 0 (stay silent) to ${cfg.maxUrgency} (must speak).`,
        options: [],
        allowText: false,
        maxUrgency: cfg.maxUrgency,
      };
      const bids = await Promise.all(
        eligible.map(async (p) => ({ p, r: await ask(p, bidDecision) })),
      );

      const volunteers: { p: Player; urgency: number }[] = [];
      for (const { p, r } of bids) {
        if (!r.ok) {
          forfeit(p, bidDecision, r.reason, r.raw);
          const w = checkWinner();
          if (w) return w;
          continue;
        }
        const urgency = r.result.urgency ?? 0;
        if (urgency > 0 && p.alive) volunteers.push({ p, urgency });
      }
      if (volunteers.length === 0) break; // the room fell silent → done

      // 2) PICK — keenest gets the floor; tiebreak favors who's spoken least.
      const maxU = Math.max(...volunteers.map((v) => v.urgency));
      let top = volunteers.filter((v) => v.urgency === maxU);
      const minSpoken = Math.min(...top.map((v) => spoken.get(v.p.id) ?? 0));
      top = top.filter((v) => (spoken.get(v.p.id) ?? 0) === minSpoken);
      const speaker = top[Math.floor(rand() * top.length)].p;

      // 3) SPEAK — only the chosen player generates a message.
      const sayDecision: Decision = {
        type: "statement",
        prompt: sayPrompt,
        options: [],
        allowText: true,
      };
      const sr = await ask(speaker, sayDecision);
      if (!sr.ok) {
        forfeit(speaker, sayDecision, sr.reason, sr.raw);
        const w = checkWinner();
        if (w) return w;
        continue;
      }
      spoken.set(speaker.id, (spoken.get(speaker.id) ?? 0) + 1);
      const text = (sr.result.text ?? "").trim();
      emit({
        type: audience === "mafia" ? "mafia-chat" : "statement",
        actor: speaker.id,
        message: `${speaker.name}: "${text || "(says nothing)"}"`,
        visibleTo,
      });
    }
    return null;
  }

  // Ask a player for a night target; forfeit on invalid. Returns the target id,
  // or null if the player forfeited (caller should re-check the winner).
  async function askTarget(
    player: Player,
    decision: Decision,
  ): Promise<string | null> {
    const r = await ask(player, decision);
    if (!r.ok) {
      forfeit(player, decision, r.reason, r.raw);
      return null;
    }
    return r.result.target!;
  }

  // --- Main loop -----------------------------------------------------------
  for (let guard = 0; guard < players.length * 4 + 10; guard++) {
    day += 1;

    // ----- NIGHT -----
    phase = "night";
    emit({
      type: "night-falls",
      message: `Night ${day} falls. The town sleeps.`,
    });

    // Mafia coordinate (volunteer loop, mafia-only).
    if (livingMafia().length > 0 && mafiaChatCfg.maxMessages > 0) {
      emit({
        type: "mafia-chat",
        message: "The mafia confer in the dark.",
        visibleTo: mafiaIds(players),
      });
      const w = await runDiscussion(
        livingMafia(),
        mafiaIds(players),
        mafiaChatCfg,
        "mafia",
      );
      if (w) return w;
    }

    // Detective investigates first (so results are available next day).
    for (const det of living().filter((p) => p.role === "detective")) {
      const options = living()
        .filter((p) => p.id !== det.id)
        .map((p) => p.id);
      if (options.length === 0) continue;
      const target = await askTarget(det, {
        type: "detective-investigate",
        prompt:
          "Choose one player to investigate tonight. You will learn if they are mafia.",
        options,
        allowText: false,
      });
      if (target === null) {
        const w = checkWinner();
        if (w) return w;
        continue;
      }
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
      const target = await askTarget(doc, {
        type: "doctor-save",
        prompt:
          "Choose one player to protect from the mafia tonight (you may protect yourself).",
        options,
        allowText: false,
      });
      if (target === null) {
        const w = checkWinner();
        if (w) return w;
        continue;
      }
      protectedId = target;
      emit({
        type: "thought",
        actor: doc.id,
        message: `You chose to protect ${name(protectedId)} tonight.`,
        visibleTo: [doc.id],
      });
    }

    // Mafia choose a victim (each votes; plurality wins).
    const mafiaVotes: string[] = [];
    for (const m of livingMafia()) {
      const options = living()
        .filter((p) => p.role !== "mafia")
        .map((p) => p.id);
      if (options.length === 0) break;
      const target = await askTarget(m, {
        type: "mafia-kill",
        prompt: "Choose one player for the mafia to kill tonight.",
        options,
        allowText: false,
      });
      if (target === null) {
        const w = checkWinner();
        if (w) return w;
        continue;
      }
      mafiaVotes.push(target);
      emit({
        type: "mafia-target",
        actor: m.id,
        target,
        message: `${m.name} votes to kill ${name(target)}.`,
        visibleTo: mafiaIds(players),
      });
    }
    const victim = plurality(mafiaVotes, rand);

    // ----- DAY: resolve the night -----
    phase = "day-discussion";
    if (victim && victim !== protectedId && byId.get(victim)!.alive) {
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

    // ----- DAY: discussion (volunteer loop) -----
    emit({
      type: "day-breaks",
      message: "The town gathers to discuss who among them is mafia.",
    });
    result = await runDiscussion(living(), undefined, discussionCfg, "town");
    if (result) return result;

    // ----- DAY: vote (simultaneous plurality) -----
    phase = "day-vote";
    const voters = living();
    const voteResults = await Promise.all(
      voters.map(async (p) => {
        const options = living()
          .filter((q) => q.id !== p.id)
          .map((q) => q.id);
        const decision: Decision = {
          type: "vote",
          prompt:
            "Vote to eliminate one player. The player with the most votes is eliminated.",
          options,
          allowText: false,
        };
        return { p, decision, r: await ask(p, decision) };
      }),
    );
    const votes: string[] = [];
    for (const { p, decision, r } of voteResults) {
      if (!r.ok) {
        forfeit(p, decision, r.reason, r.raw);
        continue;
      }
      votes.push(r.result.target!);
      emit({
        type: "vote",
        actor: p.id,
        target: r.result.target,
        message: `${p.name} votes to eliminate ${name(r.result.target!)}.`,
      });
    }
    result = checkWinner();
    if (result) return result;

    const eliminated = plurality(votes, rand, /*tieIsNoOp*/ true);
    if (eliminated && byId.get(eliminated)!.alive) {
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
        message: "The vote is tied (or empty) — no one is eliminated today.",
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

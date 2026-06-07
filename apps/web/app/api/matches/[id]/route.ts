import { getLiveMatch, snapshot } from "../../../../lib/matches";
import { getMatch } from "@ai-battle/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Live progress (from memory) while running, otherwise the stored match. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const liveMatch = getLiveMatch(id);
  if (liveMatch) return Response.json(snapshot(liveMatch));

  const db = await getMatch(id);
  if (!db) return new Response("Not found", { status: 404 });

  return Response.json({
    id: db.id,
    status: db.status,
    source: "db",
    mock: (db.config as unknown as { mock?: boolean } | null)?.mock ?? false,
    winner: db.winner,
    reason: db.reason,
    error: null,
    players: db.players.map((p) => ({
      seatId: p.seatId,
      seatName: p.seatName,
      label: p.model.label,
      role: p.role,
      won: p.won,
      forfeited: p.forfeited,
    })),
    events: db.events.map((e) => ({
      idx: e.idx,
      type: e.type,
      message: e.message,
      day: e.day,
      phase: e.phase,
      private: e.visibleTo.length > 0,
    })),
    forfeits: db.players
      .filter((p) => p.forfeited)
      .map((p) => ({ name: p.seatName, reason: "forfeited" })),
  });
}

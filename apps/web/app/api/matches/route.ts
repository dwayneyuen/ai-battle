import { startMatch, type GameId } from "../../../lib/matches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GAMES: GameId[] = ["mafia", "rolloff"];

/** Kick off a new game; returns its id. Body: { game?, mock? }. */
export async function POST(req: Request) {
  let body: { game?: string; mock?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // empty/invalid body is fine — use defaults
  }
  const game = GAMES.includes(body?.game as GameId)
    ? (body.game as GameId)
    : "mafia";
  const id = startMatch({ game, mock: Boolean(body?.mock) });
  return Response.json({ id });
}

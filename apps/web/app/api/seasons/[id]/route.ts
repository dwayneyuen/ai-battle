import { getLiveSeason, dbSeasonSnapshot } from "../../../../lib/seasons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Live progress (from memory) while running, otherwise the stored season. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const liveSeason = getLiveSeason(id);
  if (liveSeason) return Response.json(liveSeason);

  const db = await dbSeasonSnapshot(id);
  if (!db) return new Response("Not found", { status: 404 });
  return Response.json(db);
}

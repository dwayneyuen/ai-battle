import { startMatch } from "../../../lib/matches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Kick off a new Mafia game; returns its id. Body: { mock? }. */
export async function POST(req: Request) {
  let body: { mock?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // empty/invalid body is fine — use defaults
  }
  const id = startMatch({ mock: Boolean(body?.mock) });
  return Response.json({ id });
}

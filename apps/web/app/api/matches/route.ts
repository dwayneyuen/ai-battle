import { startMatch } from "../../../lib/matches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Kick off a new Mafia game; returns its id. Body: { mock?, models? }. */
export async function POST(req: Request) {
  let body: { mock?: boolean; models?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    // empty/invalid body is fine — use defaults
  }
  const id = startMatch({ mock: Boolean(body?.mock), models: body?.models });
  return Response.json({ id });
}

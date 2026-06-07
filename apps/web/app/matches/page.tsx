import { countMatches, listMatchesPage } from "@ai-battle/db";
import Link from "next/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILTERS = [
  { id: "", label: "All" },
  { id: "mafia", label: "Mafia" },
  { id: "rolloff", label: "Roll-Off" },
];
const GAME_NAMES: Record<string, string> = {
  mafia: "Mafia",
  rolloff: "Roll-Off",
};
const PAGE_SIZE = 25;

function fmt(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toISOString().slice(0, 16).replace("T", " ");
}

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const game = FILTERS.some((f) => f.id === sp.game) ? sp.game! : "";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  let matches: Awaited<ReturnType<typeof listMatchesPage>> = [];
  let total = 0;
  let error: string | null = null;
  try {
    [matches, total] = await Promise.all([
      listMatchesPage({ game: game || undefined, skip, take: PAGE_SIZE }),
      countMatches(game || undefined),
    ]);
  } catch (e) {
    error = (e as Error).message;
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) =>
    `/matches?${game ? `game=${game}&` : ""}page=${p}`;

  return (
    <>
      <section className="hero">
        <h1>Match history</h1>
        <p>
          Every completed match, newest first — click one to step through the
          replay. (Prisoner&rsquo;s Dilemma runs as Seasons; see that page.)
        </p>
        <div className="tabs">
          {FILTERS.map((f) => (
            <Link
              key={f.id || "all"}
              href={`/matches${f.id ? `?game=${f.id}` : ""}`}
              className={`tab${f.id === game ? " active" : ""}`}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </section>

      {error ? (
        <p className="error">Couldn&rsquo;t load matches: {error}</p>
      ) : matches.length === 0 ? (
        <p className="legend">No matches yet.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="providers">
              <thead>
                <tr>
                  <th>When (UTC)</th>
                  <th>Game</th>
                  <th>Winner</th>
                  <th>Players</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m) => (
                  <tr key={m.id}>
                    <td>{fmt(m.finishedAt)}</td>
                    <td>{GAME_NAMES[m.game] ?? m.game}</td>
                    <td>
                      <strong>{m.winner ?? "—"}</strong>
                    </td>
                    <td className="notes">
                      {m.players.map((p) => p.seatName).join(", ")}
                    </td>
                    <td>
                      <Link href={`/matches/${m.id}`}>view →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pager">
            {page > 1 ? (
              <Link href={href(page - 1)} className="btn">
                ← Prev
              </Link>
            ) : (
              <span className="btn disabled">← Prev</span>
            )}
            <span className="pager-info">
              Page {page} of {totalPages} · {total} matches
            </span>
            {page < totalPages ? (
              <Link href={href(page + 1)} className="btn">
                Next →
              </Link>
            ) : (
              <span className="btn disabled">Next →</span>
            )}
          </div>
        </>
      )}
    </>
  );
}

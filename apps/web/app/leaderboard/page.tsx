import { getLeaderboard } from "@ai-battle/db";
import Link from "next/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GAMES = [
  { id: "mafia", label: "Mafia" },
  { id: "rolloff", label: "Roll-Off" },
];

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  const sp = await searchParams;
  const game = GAMES.some((g) => g.id === sp.game) ? sp.game! : "mafia";
  const gameLabel = GAMES.find((g) => g.id === game)!.label;

  let rows: Awaited<ReturnType<typeof getLeaderboard>> = [];
  let error: string | null = null;
  try {
    rows = await getLeaderboard(game);
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <>
      <section className="hero">
        <h1>Leaderboard</h1>
        <p>
          ELO across all completed {gameLabel} matches. Each game updates every
          player&rsquo;s rating (team-based, K=32); forfeits count as losses.
          {game === "rolloff"
            ? " Roll-Off is pure luck, so these should stay roughly flat — a drift would signal a bug."
            : ""}
        </p>
        <div className="tabs">
          {GAMES.map((g) => (
            <Link
              key={g.id}
              href={`/leaderboard?game=${g.id}`}
              className={`tab${g.id === game ? " active" : ""}`}
            >
              {g.label}
            </Link>
          ))}
        </div>
      </section>

      {error ? (
        <p className="error">Couldn&rsquo;t load standings: {error}</p>
      ) : rows.length === 0 ? (
        <p className="legend">
          No {gameLabel} games yet — start one on the Play page and the
          standings will appear here.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="providers">
            <thead>
              <tr>
                <th>#</th>
                <th>Model</th>
                <th>ELO</th>
                <th>W</th>
                <th>L</th>
                <th>Games</th>
                <th>Forfeits</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td>{i + 1}</td>
                  <td className="provider-name">{r.model.label}</td>
                  <td>
                    <strong>{r.elo}</strong>
                  </td>
                  <td>{r.wins}</td>
                  <td>{r.losses}</td>
                  <td>{r.games}</td>
                  <td>{r.forfeits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

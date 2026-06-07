import { getLeaderboard } from "@ai-battle/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  let rows: Awaited<ReturnType<typeof getLeaderboard>> = [];
  let error: string | null = null;
  try {
    rows = await getLeaderboard("mafia");
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <>
      <section className="hero">
        <h1>Leaderboard</h1>
        <p>
          Mafia ELO across all completed matches. Each game updates every
          player&rsquo;s rating (team-based, K=32) — win as town or mafia to
          gain, and forfeits count as losses.
        </p>
      </section>

      {error ? (
        <p className="error">Couldn&rsquo;t load standings: {error}</p>
      ) : rows.length === 0 ? (
        <p className="legend">
          No games yet — start one on the <strong>Play</strong> page and the
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

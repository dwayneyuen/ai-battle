import Link from "next/link";
import { listPdSeasons } from "@ai-battle/db";
import { StartSeason } from "./StartSeason";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function topLine(standings: unknown): string {
  if (!Array.isArray(standings) || standings.length === 0) return "—";
  return (standings as { label: string; total: number }[])
    .map((s) => `${s.label} ${s.total}`)
    .join(" · ");
}

export default async function SeasonsPage() {
  let rows: Awaited<ReturnType<typeof listPdSeasons>> = [];
  let error: string | null = null;
  try {
    rows = await listPdSeasons(50);
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <>
      <section className="hero">
        <h1>Prisoner&rsquo;s Dilemma — seasons</h1>
        <p>
          A season studies how models <em>reason over time</em>. Each model
          declares a strategy, plays a round robin against every other model,
          reflects on its own results, and revises — across several generations.
          Reasoning is captured at three levels: per round, per match, and per
          generation. Open one to step through it.
        </p>
        <StartSeason />
      </section>

      {error ? (
        <p className="error">Couldn&rsquo;t load seasons: {error}</p>
      ) : rows.length === 0 ? (
        <p className="legend">
          No seasons yet — start one above (mock is free and instant).
        </p>
      ) : (
        <div className="table-wrap">
          <table className="providers">
            <thead>
              <tr>
                <th>When</th>
                <th>Generations</th>
                <th>Final standings</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const last = s.generations[s.generations.length - 1];
                return (
                  <tr key={s.id}>
                    <td>
                      {new Date(s.finishedAt ?? s.createdAt).toLocaleString()}
                    </td>
                    <td>{s.generations.length}</td>
                    <td className="provider-name">
                      {topLine(last?.standings)}
                    </td>
                    <td>
                      <Link href={`/seasons/${s.id}`}>replay →</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

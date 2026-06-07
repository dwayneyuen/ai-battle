import { getCostStats } from "@ai-battle/db";
import { getNeonUsage, getOpenRouterUsage } from "../../lib/costs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RENDER_MONTHLY = Number(process.env.RENDER_MONTHLY_USD ?? 7);
const NEON_MONTHLY = Number(process.env.NEON_MONTHLY_USD ?? 0);

const usd = (n: number) => `$${n.toFixed(2)}`;

const GAME_NAMES: Record<string, string> = {
  mafia: "Mafia",
  rolloff: "Roll-Off",
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const sp = await searchParams;
  const adminToken = process.env.ADMIN_TOKEN;
  if (adminToken && sp.token !== adminToken) {
    return (
      <section className="hero">
        <h1>Admin</h1>
        <p className="legend">
          Protected. Append <code>?token=…</code> to the URL to view.
        </p>
      </section>
    );
  }

  const [or, neon, stats] = await Promise.all([
    getOpenRouterUsage(),
    getNeonUsage(),
    getCostStats().catch(() => null),
  ]);
  const fixedMonthly = RENDER_MONTHLY + NEON_MONTHLY;

  return (
    <>
      <section className="hero">
        <h1>Admin · Costs</h1>
        <p>
          Live OpenRouter spend plus fixed infrastructure.
          {adminToken
            ? ""
            : " ⚠ Ungated — set ADMIN_TOKEN to require a ?token."}
        </p>
      </section>

      <div className="cost-grid">
        <div className="cost-card">
          <div className="cost-label">OpenRouter · models</div>
          {or.ok ? (
            <>
              <div className="cost-big">{usd(or.totalUsage)}</div>
              <div className="cost-sub">
                spent · {usd(or.remaining)} left of {usd(or.totalCredits)}{" "}
                loaded · live, pay-as-you-go
              </div>
            </>
          ) : (
            <div className="cost-sub error">unavailable — {or.error}</div>
          )}
        </div>

        <div className="cost-card">
          <div className="cost-label">Render · web service</div>
          <div className="cost-big">
            {usd(RENDER_MONTHLY)}
            <span className="cost-unit">/mo</span>
          </div>
          <div className="cost-sub">
            Starter, always-on · estimate (no billing API)
          </div>
        </div>

        <div className="cost-card">
          <div className="cost-label">Neon · Postgres</div>
          {neon.ok ? (
            <>
              <div className="cost-big">
                {neon.computeHours.toFixed(1)}
                <span className="cost-unit">compute-hrs</span>
              </div>
              <div className="cost-sub">
                this billing period · {neon.projects} project
                {neon.projects === 1 ? "" : "s"}
                {neon.storageGiB != null
                  ? ` · ${neon.storageGiB.toFixed(2)} GiB storage`
                  : ""}{" "}
                · ~{usd(NEON_MONTHLY)}/mo plan
              </div>
            </>
          ) : (
            <>
              <div className="cost-big">
                {usd(NEON_MONTHLY)}
                <span className="cost-unit">/mo</span>
              </div>
              <div className="cost-sub">
                {NEON_MONTHLY === 0 ? "free tier" : "paid plan"} · estimate (
                {neon.error})
              </div>
            </>
          )}
        </div>

        <div className="cost-card">
          <div className="cost-label">Fixed monthly</div>
          <div className="cost-big">
            {usd(fixedMonthly)}
            <span className="cost-unit">/mo</span>
          </div>
          <div className="cost-sub">Render + Neon</div>
        </div>
      </div>

      {stats ? (
        <>
          <h2 className="section-title">Activity</h2>
          <div className="table-wrap">
            <table className="providers">
              <tbody>
                <tr>
                  <td>Total matches</td>
                  <td>
                    <strong>{stats.totalMatches}</strong>
                  </td>
                </tr>
                {stats.byGame.map((g) => (
                  <tr key={g.game}>
                    <td>· {GAME_NAMES[g.game] ?? g.game}</td>
                    <td>{g.count}</td>
                  </tr>
                ))}
                <tr>
                  <td>PD seasons</td>
                  <td>{stats.totalSeasons}</td>
                </tr>
                <tr>
                  <td>Model calls logged</td>
                  <td>
                    <strong>{stats.totalCalls}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <p className="legend">
        OpenRouter is the only live, usage-based cost. Render &amp; Neon are
        mostly fixed and have no public per-account billing API, so
        they&rsquo;re configurable estimates (<code>RENDER_MONTHLY_USD</code> /{" "}
        <code>NEON_MONTHLY_USD</code>). Precise per-model spend would mean
        capturing OpenRouter&rsquo;s per-call cost into each model log — a good
        follow-up.
      </p>
    </>
  );
}

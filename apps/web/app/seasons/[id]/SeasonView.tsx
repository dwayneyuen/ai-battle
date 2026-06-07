"use client";

import { useEffect, useState } from "react";

type Move = "C" | "D";
interface RoundView {
  a: Move;
  b: Move;
  scoreA: number;
  scoreB: number;
  thoughtsA?: string;
  thoughtsB?: string;
}
interface MatchView {
  aLabel: string;
  bLabel: string;
  scoreA: number;
  scoreB: number;
  rounds: RoundView[];
  reflections: { label: string; thoughts: string }[];
}
interface GenerationView {
  idx: number;
  matches: MatchView[];
  standings: { label: string; total: number }[];
  revisions: {
    label: string;
    strategy: string;
    notebook: string;
    thoughts: string;
  }[];
}
interface Snap {
  id: string;
  status: "running" | "completed" | "void";
  source: "live" | "db";
  mock: boolean;
  error: string | null;
  config: { rounds: number; generations: number };
  players: { label: string }[];
  declarations: { label: string; strategy: string; thoughts: string }[];
  generations: GenerationView[];
  finalStandings: { label: string; total: number }[];
}

const Tape = ({ move }: { move: Move }) => (
  <span className={move === "C" ? "pd-c" : "pd-d"}>{move}</span>
);

function MatchBlock({ m }: { m: MatchView }) {
  return (
    <details className="pd-match">
      <summary>
        <strong>{m.aLabel}</strong> vs <strong>{m.bLabel}</strong>
        <span className="pd-score">
          {m.scoreA}–{m.scoreB}
        </span>
        <span className="pd-tape">
          {m.rounds.map((r, i) => (
            <span key={i} className="pd-pair">
              <Tape move={r.a} />
              <Tape move={r.b} />
            </span>
          ))}
        </span>
      </summary>

      <div className="pd-rounds">
        {m.rounds.map((r, i) => (
          <div key={i} className="pd-round">
            <span className="pd-round-no">R{i + 1}</span>
            <span className="pd-round-moves">
              {m.aLabel} <Tape move={r.a} /> · {m.bLabel} <Tape move={r.b} />{" "}
              <span className="pd-round-score">
                ({r.scoreA}/{r.scoreB})
              </span>
            </span>
            {(r.thoughtsA || r.thoughtsB) && (
              <div className="pd-thoughts">
                {r.thoughtsA && (
                  <div>
                    <em>{m.aLabel}:</em> {r.thoughtsA}
                  </div>
                )}
                {r.thoughtsB && (
                  <div>
                    <em>{m.bLabel}:</em> {r.thoughtsB}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {m.reflections.length > 0 && (
        <div className="pd-reflections">
          <h4>Post-match reflections</h4>
          {m.reflections.map((r, i) => (
            <p key={i}>
              <strong>{r.label}:</strong> {r.thoughts}
            </p>
          ))}
        </div>
      )}
    </details>
  );
}

export function SeasonView({ id }: { id: string }) {
  const [snap, setSnap] = useState<Snap | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let stop = false;
    async function poll() {
      try {
        const r = await fetch(`/api/seasons/${id}`, { cache: "no-store" });
        if (r.status === 404) {
          if (!stop) setNotFound(true);
          return;
        }
        if (r.ok) {
          const d = (await r.json()) as Snap;
          if (!stop) setSnap(d);
          if (d.status !== "running") return; // stop once finished
        }
      } catch {
        // transient — keep polling
      }
      if (!stop) setTimeout(poll, 2000);
    }
    poll();
    return () => {
      stop = true;
    };
  }, [id]);

  if (notFound) return <p>Season not found.</p>;
  if (!snap) return <p>Loading…</p>;

  return (
    <>
      <section className="hero">
        <h1>
          Prisoner&rsquo;s Dilemma season{" "}
          {snap.mock ? <span className="status planned">mock</span> : null}
        </h1>
        <p>
          Status: <strong>{snap.status}</strong> · {snap.config.generations}{" "}
          generations · {snap.config.rounds} rounds/match
          {snap.error ? (
            <span style={{ color: "var(--amber)" }}> — {snap.error}</span>
          ) : null}
        </p>
        {snap.finalStandings.length > 0 && (
          <p className="players">
            {snap.finalStandings
              .map((s) => `${s.label} ${s.total}`)
              .join("  ·  ")}
          </p>
        )}
      </section>

      {snap.declarations.length > 0 && (
        <>
          <h2 className="section-title">Opening declarations</h2>
          <div className="pd-decls">
            {snap.declarations.map((d, i) => (
              <article key={i} className="pd-decl">
                <h3>{d.label}</h3>
                <p className="pd-strategy">{d.strategy}</p>
                {d.thoughts && <p className="pd-think">{d.thoughts}</p>}
              </article>
            ))}
          </div>
        </>
      )}

      {snap.generations.map((g) => (
        <div key={g.idx} className="pd-gen">
          <h2 className="section-title">Generation {g.idx + 1}</h2>

          {g.standings.length > 0 && (
            <p className="legend">
              Standings after this round robin:{" "}
              <strong>
                {g.standings.map((s) => `${s.label} ${s.total}`).join(" · ")}
              </strong>
            </p>
          )}

          <div className="pd-matches">
            {g.matches.map((m, i) => (
              <MatchBlock key={i} m={m} />
            ))}
          </div>

          {g.revisions.length > 0 && (
            <>
              <h3 className="pd-rev-title">Strategy revisions</h3>
              <div className="pd-decls">
                {g.revisions.map((r, i) => (
                  <article key={i} className="pd-decl">
                    <h3>{r.label}</h3>
                    <p className="pd-strategy">{r.strategy}</p>
                    {r.notebook && (
                      <details className="pd-notebook">
                        <summary>notebook</summary>
                        <p>{r.notebook}</p>
                      </details>
                    )}
                    {r.thoughts && <p className="pd-think">{r.thoughts}</p>}
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
      ))}

      {snap.status === "running" ? (
        <p className="line thinking">…running…</p>
      ) : null}
    </>
  );
}

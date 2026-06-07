"use client";

import { useEffect, useRef, useState } from "react";

interface Ev {
  idx: number;
  type: string;
  message: string;
  day: number;
  phase: string;
  private: boolean;
}
interface Call {
  idx: number;
  seatName: string;
  decisionType: string;
  day: number;
  phase: string;
  prompt: string;
  response: string;
  thoughts: string | null;
  valid: boolean;
  latencyMs: number | null;
}
const GAME_NAMES: Record<string, string> = {
  mafia: "Mafia",
  rolloff: "Roll-Off",
};

interface Snap {
  id: string;
  game?: string;
  status: "running" | "completed" | "void";
  mock?: boolean;
  winner: string | null;
  reason: string | null;
  error: string | null;
  players: { seatId: string; seatName: string; label: string }[];
  events: Ev[];
  forfeits: { name: string; reason: string }[];
  rules?: string | null;
  calls?: Call[];
}

export function MatchView({ id }: { id: string }) {
  const [snap, setSnap] = useState<Snap | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [showPrivate, setShowPrivate] = useState(true);
  const [showPrompts, setShowPrompts] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  // Whether the reader is parked at the bottom. We only auto-scroll to new
  // messages while this is true, so scrolling up to read is never interrupted.
  const stick = useRef(true);

  // Re-runs when showPrompts toggles so it refetches with/without ?calls=1
  // (even for a finished game, where the poll loop has already stopped).
  useEffect(() => {
    let stop = false;
    const url = `/api/matches/${id}${showPrompts ? "?calls=1" : ""}`;
    async function poll() {
      try {
        const r = await fetch(url, { cache: "no-store" });
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
      if (!stop) setTimeout(poll, 1500);
    }
    poll();
    return () => {
      stop = true;
    };
  }, [id, showPrompts]);

  // Track whether the reader is at (or near) the bottom of the page. Updated on
  // scroll rather than after render, so we know their intent *before* new
  // messages grow the page.
  useEffect(() => {
    function onScroll() {
      stick.current =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 120;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (stick.current) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [snap?.events.length]);

  if (notFound) return <p>Match not found.</p>;
  if (!snap) return <p>Loading…</p>;

  const events = snap.events.filter((e) => showPrivate || !e.private);

  return (
    <>
      <section className="hero">
        <h1>
          {GAME_NAMES[snap.game ?? "mafia"] ?? "Game"} match{" "}
          {snap.mock ? <span className="status planned">mock</span> : null}
        </h1>
        <p>
          Status: <strong>{snap.status}</strong>
          {snap.winner ? (
            <>
              {" "}
              — <strong>{snap.winner.toUpperCase()}</strong> wins. {snap.reason}
            </>
          ) : null}
          {snap.error ? (
            <span style={{ color: "var(--amber)" }}> — {snap.error}</span>
          ) : null}
        </p>
        <p className="players">
          {snap.players.map((p) => `${p.seatName} = ${p.label}`).join("  ·  ")}
        </p>
        <div className="toggles">
          <label className="toggle">
            <input
              type="checkbox"
              checked={showPrivate}
              onChange={(e) => setShowPrivate(e.target.checked)}
            />{" "}
            show private (night actions &amp; thoughts)
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={showPrompts}
              onChange={(e) => setShowPrompts(e.target.checked)}
            />{" "}
            show model prompts
          </label>
        </div>
      </section>

      <div className="transcript">
        {events.map((e) => (
          <div
            key={e.idx}
            className={`line ev-${e.type}${e.private ? " private" : ""}`}
          >
            {e.message}
          </div>
        ))}
        {snap.status === "running" ? (
          <div className="line thinking">…thinking…</div>
        ) : null}
        <div ref={endRef} />
      </div>

      {showPrompts ? (
        <div className="logs">
          <h2 className="section-title">
            Model prompts{snap.calls ? ` (${snap.calls.length} calls)` : ""}
          </h2>
          {snap.calls && snap.calls.length === 0 ? (
            <p className="legend">
              No model calls yet
              {snap.mock ? " (mock games make no model calls)" : ""}.
            </p>
          ) : null}
          {snap.rules ? (
            <details className="call">
              <summary>System rules (sent with every call)</summary>
              <pre className="prompt">{snap.rules}</pre>
            </details>
          ) : null}
          {(snap.calls ?? []).map((c) => (
            <details key={c.idx} className="call">
              <summary>
                D{c.day} · {c.phase} · <strong>{c.seatName}</strong> ·{" "}
                {c.decisionType}
                {c.valid ? "" : " · forfeit"}
                {c.latencyMs != null ? ` · ${c.latencyMs}ms` : ""}
              </summary>
              <div className="call-body">
                <div className="call-label">Prompt the model saw</div>
                <pre className="prompt">{c.prompt}</pre>
                <div className="call-label">Raw response</div>
                <pre className="response">{c.response}</pre>
                {c.thoughts ? (
                  <>
                    <div className="call-label">Thoughts</div>
                    <p className="thoughts-text">{c.thoughts}</p>
                  </>
                ) : null}
              </div>
            </details>
          ))}
        </div>
      ) : null}
    </>
  );
}

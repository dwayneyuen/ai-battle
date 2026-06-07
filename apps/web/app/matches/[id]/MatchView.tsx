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
interface Snap {
  id: string;
  status: "running" | "completed" | "void";
  mock?: boolean;
  winner: string | null;
  reason: string | null;
  error: string | null;
  players: { seatId: string; seatName: string; label: string }[];
  events: Ev[];
  forfeits: { name: string; reason: string }[];
}

export function MatchView({ id }: { id: string }) {
  const [snap, setSnap] = useState<Snap | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [showPrivate, setShowPrivate] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stop = false;
    async function poll() {
      try {
        const r = await fetch(`/api/matches/${id}`, { cache: "no-store" });
        if (r.status === 404) {
          if (!stop) setNotFound(true);
          return;
        }
        if (r.ok) {
          const d = (await r.json()) as Snap;
          if (!stop) setSnap(d);
          if (d.status !== "running") return; // stop polling once finished
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
  }, [id]);

  // Keep the latest line in view as the game streams in.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [snap?.events.length]);

  if (notFound) return <p>Match not found.</p>;
  if (!snap) return <p>Loading…</p>;

  const events = snap.events.filter((e) => showPrivate || !e.private);

  return (
    <>
      <section className="hero">
        <h1>
          Mafia match{" "}
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
        <label className="toggle">
          <input
            type="checkbox"
            checked={showPrivate}
            onChange={(e) => setShowPrivate(e.target.checked)}
          />{" "}
          show private (night actions &amp; thoughts)
        </label>
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
    </>
  );
}

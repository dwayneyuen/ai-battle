"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Mafia/Roll-Off start a "match"; Prisoner's Dilemma starts a "season".
const GAMES = [
  { id: "mafia", label: "Mafia", endpoint: "/api/matches", route: "/matches" },
  {
    id: "rolloff",
    label: "Roll-Off",
    endpoint: "/api/matches",
    route: "/matches",
  },
  {
    id: "pd",
    label: "Prisoner's Dilemma",
    endpoint: "/api/seasons",
    route: "/seasons",
  },
];

export function StartButtons() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(
    game: (typeof GAMES)[number],
    mock: boolean,
  ): Promise<void> {
    setBusy(`${game.id}-${mock}`);
    setError(null);
    try {
      const res = await fetch(game.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ game: game.id, mock }),
      });
      if (!res.ok) throw new Error(`start failed (${res.status})`);
      const data = (await res.json()) as { id: string };
      router.push(`${game.route}/${data.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <div>
      {GAMES.map((g) => (
        <div className="game-row" key={g.id}>
          <span className="game-row-label">{g.label}</span>
          <div className="start-buttons">
            <button
              className="btn"
              disabled={busy !== null}
              onClick={() => start(g, true)}
            >
              {busy === `${g.id}-true` ? "Starting…" : "Mock (free)"}
            </button>
            <button
              className="btn primary"
              disabled={busy !== null}
              onClick={() => start(g, false)}
            >
              {busy === `${g.id}-false` ? "Starting…" : "Real models"}
            </button>
          </div>
        </div>
      ))}
      {error ? <p className="error">{error}</p> : null}
      <p className="legend" style={{ marginTop: "20px" }}>
        Browse past runs: <Link href="/matches">Match history</Link> ·{" "}
        <Link href="/seasons">PD seasons</Link>
      </p>
    </div>
  );
}

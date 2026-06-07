"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const GAMES = [
  { id: "mafia", label: "Mafia" },
  { id: "rolloff", label: "Roll-Off" },
];

export function StartButtons() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(game: string, mock: boolean) {
    setBusy(`${game}-${mock}`);
    setError(null);
    try {
      const res = await fetch("/api/matches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ game, mock }),
      });
      if (!res.ok) throw new Error(`start failed (${res.status})`);
      const data = (await res.json()) as { id: string };
      router.push(`/matches/${data.id}`);
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
              onClick={() => start(g.id, true)}
            >
              {busy === `${g.id}-true` ? "Starting…" : "Mock (free)"}
            </button>
            <button
              className="btn primary"
              disabled={busy !== null}
              onClick={() => start(g.id, false)}
            >
              {busy === `${g.id}-false` ? "Starting…" : "Real models"}
            </button>
          </div>
        </div>
      ))}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}

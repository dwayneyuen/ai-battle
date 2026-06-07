"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function StartSeason() {
  const router = useRouter();
  const [busy, setBusy] = useState<"mock" | "models" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(mock: boolean) {
    setBusy(mock ? "mock" : "models");
    setError(null);
    try {
      const res = await fetch("/api/seasons", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mock }),
      });
      if (!res.ok) throw new Error(`start failed (${res.status})`);
      const data = (await res.json()) as { id: string };
      router.push(`/seasons/${data.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="start-buttons">
        <button
          className="btn"
          disabled={busy !== null}
          onClick={() => start(true)}
        >
          {busy === "mock" ? "Starting…" : "Start a season (mock — free)"}
        </button>
        <button
          className="btn primary"
          disabled={busy !== null}
          onClick={() => start(false)}
        >
          {busy === "models" ? "Starting…" : "Start a season (real models)"}
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}

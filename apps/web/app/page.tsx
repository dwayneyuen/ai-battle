import {
  GAMES,
  GAME_FEATURE_LABELS,
  playableGames,
  plannedGames,
  type GameInfo,
} from "@ai-battle/catalog";

function playerLabel(g: GameInfo): string {
  return g.players.min === g.players.max
    ? `${g.players.min} players`
    : `${g.players.min}–${g.players.max} players`;
}

function FeatureChip({ label, on }: { label: string; on: boolean }) {
  return (
    <span className={`chip ${on ? "on" : "off"}`}>
      <span className="mark">{on ? "✓" : "✕"}</span> {label}
    </span>
  );
}

function GameCard({ g }: { g: GameInfo }) {
  return (
    <article className={`card ${g.status}`}>
      <div className="card-head">
        <h3>{g.name}</h3>
        <span className={`status ${g.status}`}>
          {g.status === "playable" ? "Playable" : "Planned"}
        </span>
      </div>
      <p className="players">{playerLabel(g)}</p>
      <p className="blurb">{g.blurb}</p>
      <div className="chips">
        {GAME_FEATURE_LABELS.map((f) => (
          <FeatureChip key={f.key} label={f.label} on={g.features[f.key]} />
        ))}
      </div>
      {g.notSupported.length > 0 && (
        <details className="notsupported">
          <summary>Not in the first version</summary>
          <ul>
            {g.notSupported.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

export default function GamesPage() {
  const playable = playableGames();
  const planned = plannedGames();

  return (
    <>
      <section className="hero">
        <h1>The games</h1>
        <p>
          AI models face off in games of strategy and social deduction. Each
          game lists the features it supports — and what its first version
          leaves out. {playable.length} playable now, {planned.length} planned.
        </p>
      </section>

      <h2 className="section-title">Playable now</h2>
      <div className="grid">
        {playable.map((g) => (
          <GameCard key={g.id} g={g} />
        ))}
      </div>

      <h2 className="section-title">Planned</h2>
      <div className="grid">
        {planned.map((g) => (
          <GameCard key={g.id} g={g} />
        ))}
      </div>

      <p className="legend">
        Showing all {GAMES.length} games. A ✓ means the feature is supported in
        the current (or first planned) version; ✕ means it isn't.
      </p>
    </>
  );
}

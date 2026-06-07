import { StartButtons } from "./StartButtons";

export default function PlayPage() {
  return (
    <>
      <section className="hero">
        <h1>Play a game</h1>
        <p>Start a match and watch it unfold. Pick a game and a roster:</p>
        <ul className="play-modes">
          <li>
            <strong>Mafia</strong> — social deduction with 7 models. The
            headliner (and the priciest).
          </li>
          <li>
            <strong>Roll-Off</strong> — a pure-luck dice race used as a smoke
            test. Every model should win equally; cheap and quick.
          </li>
        </ul>
        <p className="legend">
          Each game offers a free &ldquo;Mock&rdquo; roster (random baseline,
          instant) or &ldquo;Real models&rdquo; (a cheap OpenRouter roster,
          streamed turn by turn with the models&rsquo; thoughts).
        </p>
      </section>
      <StartButtons />
    </>
  );
}

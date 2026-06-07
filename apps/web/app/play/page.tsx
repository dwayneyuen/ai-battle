import { StartButtons } from "./StartButtons";

export default function PlayPage() {
  return (
    <>
      <section className="hero">
        <h1>Play a game</h1>
        <p>Start a Mafia match and watch it unfold:</p>
        <ul className="play-modes">
          <li>
            <strong>Mock</strong> — the free random baseline. Instant, no cost.
          </li>
          <li>
            <strong>Real models</strong> — a cheap OpenRouter roster. Takes a
            few minutes; you&rsquo;ll see each turn, including the models&rsquo;
            thoughts.
          </li>
        </ul>
      </section>
      <StartButtons />
    </>
  );
}

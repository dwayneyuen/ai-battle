import { StartButtons } from "./StartButtons";

export default function PlayPage() {
  return (
    <>
      <section className="hero">
        <h1>Play a game</h1>
        <p>
          Start a Mafia match and watch it unfold. <strong>Mock</strong> uses
          the free random baseline (instant, no cost).{" "}
          <strong>Real models</strong> fields a cheap OpenRouter roster and
          takes a few minutes — you&rsquo;ll see each turn, including the
          models&rsquo; thoughts, as it plays.
        </p>
      </section>
      <StartButtons />
    </>
  );
}

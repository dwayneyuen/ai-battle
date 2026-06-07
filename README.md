# AI Battle

A site that pits AI models (GPT, Claude, Gemini, Grok, Llama, ...) against each
other in games of **social deduction and strategy**. Matches run on their own on
a schedule (e.g. daily); the site then shows the results — standings, recent
matches, and step-through replays of each game.

Planned games: **Prisoner's Dilemma**, **Coup**, **Mafia**, **Avalon**, **Catan**,
and **Diplomacy** (see the design doc for simple-vs-full rules per game).

## Status

Working today:

- ✅ A pure, deterministic **Mafia game engine** (roles, night/day phases, voting, win detection)
- ✅ An **iterated Prisoner's Dilemma** engine + the classic Axelrod / _Selfish Gene_ strategies and a round-robin **tournament**
- ✅ **Model adapters** for OpenAI, Anthropic, Google, Groq, OpenRouter, DeepSeek, Mistral, Together, xAI, Ollama — plus a free **mock** agent so everything runs with no API keys
- ✅ A **runner CLI** for each game that plays a match and prints a colorized, spectator-friendly transcript

Coming next (see [Roadmap](#roadmap)):

- ⏳ Persistence (Prisma + hosted Postgres, e.g. Neon): matches, transcripts, results, ELO
- ⏳ Scheduled match job (daily tournament round) that runs games and saves results
- ⏳ Next.js site (read-only): leaderboard, recent matches, step-through replays
- ⏳ More games: Coup, Avalon, Catan, Diplomacy

## Quick start

```bash
pnpm install

# Watch a full game played by free mock agents (no API keys needed):
pnpm demo

# Reproducible game (same seed => same roles & outcome):
pnpm demo --seed 42

# Show only what a spectator would see (hide private night actions/thoughts):
pnpm demo --hide-private
```

### Prisoner's Dilemma

An iterated Prisoner's Dilemma with the classic strategies from Axelrod's
tournament (as told in _The Selfish Gene_). Run the round-robin and watch
**Tit for Tat** win the war despite never winning a battle:

```bash
# Classic tournament (10 rounds per match, the full strategy line-up):
pnpm pd

# Trace a single head-to-head, round by round:
pnpm pd --a tft --b alld          # Tit for Tat vs Always Defect
pnpm pd --a tft --b tft           # mutual cooperation, 30/30

# Longer matches, a chosen subset, or drop self-play:
pnpm pd --rounds 200 --strategies "tft,grudger,pavlov,alld" --no-self

# Add LLM players to the tournament (named by their spec):
pnpm pd --models "openai:gpt-5-mini,google:gemini-2.5-flash"
```

Strategy keys: `tft` (Tit for Tat), `tf2t` (Tit for Two Tats), `grudger`,
`pavlov`, `stft` (Suspicious Tit for Tat), `joss`, `allc` (Always Cooperate),
`alld` (Always Defect), `random`. Scoring uses Axelrod's payoffs
(both cooperate = 3, defect on a cooperator = 5, sucker = 0, both defect = 1).

### Playing with real models

Set whichever keys you have in a `.env` file (see `.env.example`), then assign
models to seats. Any seat you don't specify uses the free mock agent.

**Cost note:** a full 7-player game is ~50–70 model calls. On small models
(Gemini Flash, GPT-5-mini, Claude Haiku) that's roughly **$0.02–0.05 per game**;
frontier models (Opus / GPT-5 / Gemini Pro) run ~$0.50–$2. Develop with `mock`,
run real matches on small models, save frontier models for the title fights.

**Free / cheap ways to play:**

| Provider     | Spec example                                       | Key env              | Notes                            |
| ------------ | -------------------------------------------------- | -------------------- | -------------------------------- |
| `mock`       | `mock`                                             | —                    | free, no key                     |
| `ollama`     | `ollama:llama3.1`                                  | — (local)            | free, runs on your machine       |
| `google`     | `google:gemini-2.5-flash`                          | `GOOGLE_API_KEY`     | free tier at aistudio.google.com |
| `groq`       | `groq:llama-3.3-70b-versatile`                     | `GROQ_API_KEY`       | free tier, very fast             |
| `openrouter` | `openrouter:x-ai/grok-3`                           | `OPENROUTER_API_KEY` | one key → almost every model     |
| `deepseek`   | `deepseek:deepseek-chat`                           | `DEEPSEEK_API_KEY`   | very cheap                       |
| `together`   | `together:meta-llama/Llama-3.3-70B-Instruct-Turbo` | `TOGETHER_API_KEY`   | hosts many open models           |
| `mistral`    | `mistral:mistral-large-latest`                     | `MISTRAL_API_KEY`    | paid                             |
| `xai`        | `xai:grok-3`                                       | `XAI_API_KEY`        | paid                             |
| `openai`     | `openai:gpt-5-mini`                                | `OPENAI_API_KEY`     | paid (cheap on mini)             |
| `anthropic`  | `anthropic:claude-haiku-4-5`                       | `ANTHROPIC_API_KEY`  | paid (cheap on Haiku)            |

**Tip:** the simplest way to reach _every_ model — Grok, Llama, DeepSeek, Qwen,
Mistral, GPT, Claude, Gemini — is a single **OpenRouter** key. Use the `openrouter:`
prefix with any model id from their catalog.

```bash
# An all-free matchup:
pnpm demo --models "google:gemini-2.5-flash,groq:llama-3.3-70b-versatile,ollama:llama3.1"

# A title fight:
pnpm demo --models "anthropic:claude-opus-4-8,openai:gpt-5,google:gemini-2.5-pro"
```

Spec format is `provider:model`. The model part may contain `:` or `/`
(e.g. OpenRouter ids), since the provider is taken from before the first colon.

### CLI options

| Flag             | Default  | Meaning                                              |
| ---------------- | -------- | ---------------------------------------------------- |
| `--models`       | all mock | Comma-separated `provider:model` specs, one per seat |
| `--players`      | `7`      | Number of players (2–10)                             |
| `--seed`         | random   | Seed for reproducible role assignment & tie-breaks   |
| `--messages`     | `24`     | Max statements in a day's volunteer-loop discussion  |
| `--hide-private` | off      | Hide private events (night actions, model thoughts)  |

## Architecture

A pnpm monorepo that keeps game rules, models, and presentation cleanly separated:

```
packages/
  engine/   @ai-battle/engine   Pure game logic. The Mafia state machine emits a
                                GameEvent for everything that happens. No I/O, no
                                model calls — fully deterministic given a seed.
  models/   @ai-battle/models   Adapter from an LLM to a game Agent. One ChatClient
                                interface per provider (OpenAI/Anthropic/Google) plus
                                a mock. SDKs load lazily so the core runs without them.
  catalog/  @ai-battle/catalog  Single source of truth for supported games (with
                                feature matrix + planned games) and model providers.
                                The site and `pnpm catalog` both render it.
  runner/   @ai-battle/runner   CLIs that wire agents to seats, run a match, and
                                print the event stream (plus `pnpm catalog`).
apps/
  web/      Next.js site (read-only) that renders the catalog; runs as a
            long-running server on the always-on host (see docs/HOSTING.md).
```

The key seam is the **`Agent`** interface (`packages/engine/src/mafia/types.ts`):
the engine hands an agent a redacted `AgentContext` (only what that player may
know) and a `Decision` with legal options, and the agent returns an action. The
engine validates every move and falls back to a random legal move if a model
returns something invalid — so a flaky model can never corrupt a game.

Because the engine is just an event-emitting function, the scheduled match job
runs a game, persists the full `GameEvent` log to Postgres, and the web app
replays that stored log on demand — no live connection needed.

## Adding a game

Implement a new state machine alongside `mafia/` that emits `GameEvent`s and asks
`Agent`s for `Decision`s. Reuse the same model adapters unchanged — they only
depend on the generic `AgentContext` / `Decision` / `ActionResult` shapes.

## Roadmap

1. **Hosting** — an always-on backend (Render/Railway) running one persistent Node service plus a
   managed Postgres. See [docs/HOSTING.md](docs/HOSTING.md); a `render.yaml` blueprint is included.
2. **Persistence** — Prisma + the managed Postgres: matches, transcripts, results, ELO.
3. **Match job** — a scheduled job (Render Cron / Railway cron) that plays a tournament round and
   writes results to Postgres.
4. **Web** — the Next.js app grows from the catalog into leaderboard, recent matches, and a
   step-through replay of each stored transcript.
5. **More games** — Coup, The Resistance: Avalon, Catan, and eventually Diplomacy.

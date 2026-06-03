# AI Battle

A site that pits AI models (GPT, Claude, Gemini) against each other in games of
**social deduction and strategy** — and lets you spectate the matches live.

First game: **Mafia** (a.k.a. Werewolf). The roadmap adds more games and a web
spectator with live play, replays, and an ELO leaderboard.

## Status

Working today:

- ✅ A pure, deterministic **Mafia game engine** (roles, night/day phases, voting, win detection)
- ✅ **Model adapters** for OpenAI, Anthropic, and Google — plus a free **mock** agent so everything runs with no API keys
- ✅ A **runner CLI** that plays a full match and prints a colorized, spectator-friendly transcript

Coming next (see [Roadmap](#roadmap)):

- ⏳ Stateful server (Fastify + WebSockets) that streams live matches
- ⏳ Persistence (Prisma + hosted Postgres, e.g. Neon): transcripts, results, ELO ratings
- ⏳ Next.js spectator site with replays and a leaderboard
- ⏳ More games: Codenames, Avalon, Poker, Diplomacy

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

### Playing with real models

Set whichever keys you have in a `.env` file (see `.env.example`), then assign
models to seats. Any seat you don't specify uses the free mock agent.

**Cost note:** a full 7-player game is ~50–70 model calls. On small models
(Gemini Flash, GPT-5-mini, Claude Haiku) that's roughly **$0.02–0.05 per game**;
frontier models (Opus / GPT-5 / Gemini Pro) run ~$0.50–$2. Develop with `mock`,
run real matches on small models, save frontier models for the title fights.

**Free / cheap ways to play:**

| Provider     | Spec example                                        | Cost                             |
| ------------ | --------------------------------------------------- | -------------------------------- |
| `mock`       | `mock`                                              | free, no key                     |
| `ollama`     | `ollama:llama3.1`                                   | free, runs locally               |
| `google`     | `google:gemini-2.5-flash`                           | free tier at aistudio.google.com |
| `groq`       | `groq:llama-3.3-70b-versatile`                      | free tier                        |
| `openrouter` | `openrouter:meta-llama/llama-3.3-70b-instruct:free` | free models available            |
| `openai`     | `openai:gpt-5-mini`                                 | paid (cheap on mini)             |
| `anthropic`  | `anthropic:claude-haiku-4-5`                        | paid (cheap on Haiku)            |

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
| `--rounds`       | `1`      | Discussion statements per player each day            |
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
  runner/   @ai-battle/runner   CLI that wires agents to seats, runs a match, and
                                prints the event stream.
```

The key seam is the **`Agent`** interface (`packages/engine/src/mafia/types.ts`):
the engine hands an agent a redacted `AgentContext` (only what that player may
know) and a `Decision` with legal options, and the agent returns an action. The
engine validates every move and falls back to a random legal move if a model
returns something invalid — so a flaky model can never corrupt a game.

Because the engine is just an event-emitting function, the upcoming server can
run a match and forward each `GameEvent` straight to spectators over a WebSocket,
and persist the event log as a replay.

## Adding a game

Implement a new state machine alongside `mafia/` that emits `GameEvent`s and asks
`Agent`s for `Decision`s. Reuse the same model adapters unchanged — they only
depend on the generic `AgentContext` / `Decision` / `ActionResult` shapes.

## Roadmap

1. **Server** — Fastify process that runs matches and streams `GameEvent`s over WebSockets.
2. **Persistence** — Prisma + hosted Postgres (Neon or Supabase) for matches, transcripts, results, ELO.
3. **Web** — Next.js spectator: live match view, replays, leaderboard.
4. **More games** — Codenames, The Resistance: Avalon, Poker, and eventually Diplomacy.

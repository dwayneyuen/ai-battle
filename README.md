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
- ⏳ Persistence (Prisma + SQLite → Postgres): transcripts, results, ELO ratings
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

Set whichever keys you have in a `.env` file (see `.env.example`):

```bash
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
GOOGLE_API_KEY=...
```

Then assign models to seats. Any seat you don't specify uses the mock agent:

```bash
pnpm demo --models "anthropic:claude-opus-4-8,openai:gpt-5,google:gemini-2.5-pro"
```

Spec format is `provider:model` — `openai:…`, `anthropic:…`, `google:…`, or `mock`.

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
2. **Persistence** — Prisma + SQLite (→ Postgres) for matches, transcripts, results, ELO.
3. **Web** — Next.js spectator: live match view, replays, leaderboard.
4. **More games** — Codenames, The Resistance: Avalon, Poker, and eventually Diplomacy.

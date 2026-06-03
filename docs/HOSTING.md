# Hosting

AI Battle runs as an **always-on backend** with a **durable Postgres** database —
not a serverless/ephemeral setup. The persistent layer is the database; the Node
process stays running to serve the site/API and (later) to run scheduled matches.

## Architecture

```
                ┌──────────────────────────────────────┐
                │  Render / Railway (one persistent host) │
                │                                        │
  visitors ───▶ │  Web service (Node, always-on)         │
                │   • Next.js site  (apps/web)           │
                │   • API routes    (reads from DB)      │
                │                                        │
   schedule ──▶ │  Match runner (cron / worker)  ──────┐ │
                │                                      │ │
                │            ┌─────────────────────────▼─┐
                │            │  Postgres (managed, durable)│  ◀── the persistent layer
                │            │  matches · transcripts ·    │
                │            │  results · ratings          │
                │            └─────────────────────────────┘
                └──────────────────────────────────────┘
```

- **Web service** — a long-running `next start` process. Serves the catalog
  today; will serve the leaderboard, recent matches, and replays once the data
  layer lands. Because it's a real process (not serverless), it can also host a
  live/in-memory game view later if we want one.
- **Database** — managed Postgres. This is the durable store; everything worth
  keeping lives here.
- **Match runner** — a separate scheduled job (Render Cron Job / Railway cron)
  that plays a tournament round and writes results to Postgres, then exits. Not
  built yet.

## Deploying to Render (blueprint)

The repo ships a [`render.yaml`](../render.yaml) blueprint that provisions the
web service **and** the Postgres database together.

1. Push to GitHub (done — this repo).
2. In Render: **New + → Blueprint**, pick this repo. Render reads `render.yaml`.
3. Render builds with `pnpm --filter web build` and starts with
   `pnpm --filter web start`, injecting `DATABASE_URL` from the managed database.
4. Add any model API keys (`OPENAI_API_KEY`, etc.) in the dashboard — they're
   declared `sync: false` so they never live in git.

**Always-on note:** Render's _free_ web plan sleeps after ~15 min idle (cold
start on the next request) and the _free_ Postgres is removed after ~30 days.
For a genuinely always-on backend, use the **Starter** web plan (~$7/mo) and a
paid/Neon database.

## Deploying to Railway (alternative)

Railway has no blueprint file; configure in the dashboard:

1. **New Project → Deploy from GitHub repo.**
2. Add a **Postgres** plugin — it sets `DATABASE_URL` automatically.
3. Service settings:
   - Build: `corepack enable && pnpm install --frozen-lockfile && pnpm --filter web build`
   - Start: `pnpm --filter web start`
4. Add model API keys as service variables.

Railway bills by usage (a small monthly credit on the hobby plan) and does not
sleep, which makes it a good fit for an always-on process.

## Why not Vercel?

Vercel is serverless — ephemeral functions with no long-running process — so it
can't be the always-on backend, and it isn't the persistent layer either
(persistence always lives in the database). It would only fit a read-only,
scheduled-matches design. We chose the always-on backend instead, so the whole
app (site + API + match runner) lives on one persistent host.

# Hosting

AI Battle runs on a **persistent, always-on backend** with a durable **Neon
Postgres**. The backend is one long-running Node process (the Next.js app), so
an API route can kick off a Mafia game and run it **in the background** —
writing each event to Postgres as it plays — which lets you start a game and
watch its progress. No serverless functions, no cron.

## Architecture

```
  browser ──▶  Next.js app on Render (one always-on process)
                 • UI + API
                 • starts a game → runs it in the background
                 • writes events + full model logs as they happen
                         │
                         ▼
                 Neon Postgres  ◀── the only durable layer
                 matches · transcripts · model logs · ratings
```

- **Backend** — the Next.js app via `next start` on Render. A real process, so it
  can run a minutes-long game in the background and track progress.
- **Database** — Neon Postgres. Accessed only through `@ai-battle/db` (Prisma);
  no raw SQL, no second access path.
- **Full logs** — every model call is stored (the prompt the model saw, its raw
  response, the parsed action, and its reasoning) for inspection and debugging.

## Secrets

Set both in the Render dashboard (the `render.yaml` declares them as `sync: false`,
so they never live in git):

| Secret               | What                                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`       | Neon connection string — use the **direct** (non-pooled) string; a persistent server doesn't need PgBouncer, and `db push` needs a direct connection. |
| `OPENROUTER_API_KEY` | One key reaches the whole model roster.                                                                                                               |

## Deploy to Render

1. Create a **Neon** project; copy the **direct** connection string.
2. In Render: **New + → Blueprint**, pick this repo (it reads `render.yaml`).
3. Add `DATABASE_URL` and `OPENROUTER_API_KEY` as environment variables.
4. Deploy. Render runs: install → `prisma generate` → `next build`, then a
   pre-deploy `prisma db push` (syncs the schema to Neon), then `next start`.

**Always-on note:** the free web plan sleeps after ~15 min idle (cold start on
the next request). Use the **Starter** plan (~$7/mo) for a never-sleeping process.

## Why persistent (not serverless or cron)

A match is a **minutes-long job you want to start on demand and watch**.
Serverless functions cap out at a few minutes and can't hold a running game;
a cron can't be triggered on demand or tracked live. A persistent process does
both, and the durable layer is simply the database.

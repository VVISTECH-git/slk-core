# Deploying the ops app

Vercel, connected to this GitHub repo so pushing to `main` deploys — the same
arrangement `slk-stock` uses.

Two things before you start.

**The app needs a hosted database.** `DATABASE_URL` currently points at a
Postgres running on your laptop. Vercel cannot reach it, so without a hosted
one the build succeeds and every page then fails.

**There is no login yet.** A Vercel URL is public. Anyone who has it could
edit the vocabulary and delete records. Fine for a demo you hand to someone
deliberately; not fine for a URL left lying around. Vercel's own password
protection is the quickest cover until the app has real accounts.

## 1 · A database

The plan calls for **Supabase Postgres, Pro, region `ap-south-1` (Mumbai)** —
same city as the people using it, and the free tier pauses after about a week
idle and keeps no backups.

For a first look, **Neon through Vercel's Storage tab** is fewer steps: it
creates the database and sets `DATABASE_URL` on the project itself, so the
password never has to be copied anywhere.

Either way you end up with a connection string.

## 2 · The Vercel project

In the Vercel dashboard: **Add New → Project → import `VVISTECH-git/slk-core`**.

One setting matters, because this is a monorepo:

| Setting | Value |
| --- | --- |
| **Root Directory** | `apps/web` |
| Framework | Next.js — detected |
| Build / install command | leave alone; Vercel handles pnpm workspaces |
| Node version | 22 or later |

## 3 · Environment variables

| Name | Value |
| --- | --- |
| `DATABASE_URL` | The pooled connection string. On Supabase that is **port 6543**, the PgBouncer one |
| `DIRECT_URL` | The direct connection, **port 5432**. Only needed once the sync worker exists, but harmless to set now |

Supabase hands out two ports and they are not interchangeable. 6543 is
PgBouncer in transaction mode, which is what stops a few hundred serverless
functions exhausting the connection limit. 5432 is a real session, which
migrations and the queue need and pooling silently breaks.

## 4 · Create the tables and load the vocabulary

Migrations run from your machine against the hosted database, not from the
build. Point one shell at it — using your own `.env`, so the password stays
with you:

    # in slk-core, temporarily, with DATABASE_URL set to the hosted database
    pnpm db:migrate
    pnpm db:seed

`db:seed` loads the 227 values from `Master Listing - New.xlsx`. It inserts
only what is missing and never overwrites, so it is safe to run again later.

**`pnpm db:demo` refuses to run against anything that is not localhost.**
Sample stock is not real stock and has no business in a deployed database. If
you do want the demo catalogue there to show someone, load it locally and
copy it across deliberately.

## 5 · After that

Pushing to `main` deploys. Any other branch gets its own preview URL, which is
the safe way to look at a change before it reaches the live address.

## What will go wrong first

**Every page 500s.** `DATABASE_URL` is missing or wrong. The error says so.

**Pages load but every table is empty.** The migrations ran but the seed did
not, or they ran against a different database than the one Vercel is using.

**Intermittent "too many connections".** `DATABASE_URL` is pointing at the
direct port instead of the pooler.

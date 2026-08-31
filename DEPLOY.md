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

## 4 · Migrations run themselves

The build runs `db:migrate` before it builds, on production deployments only:

    if [ "$VERCEL_ENV" = "production" ]; then pnpm --filter @slk/db run db:migrate; fi
      && pnpm turbo run build --filter=@slk/web

This is in `vercel.json` rather than left to someone to remember. It was left
to someone to remember once, and the result was a green build and a site that
returned a server error on every page — the code expected a column the
database did not have. A build succeeding tells you nothing about whether the
schema moved with it.

Three properties worth keeping:

- **Production only.** Preview deployments share the same `DATABASE_URL`, so
  migrating on every preview would apply an unreviewed branch's schema to live
  data.
- **A failed migration fails the build.** Nothing deploys, and the previous
  deployment stays serving. Better than deploying code the database cannot
  answer.
- **The direct connection.** `drizzle.config.ts` prefers `DIRECT_URL`, then
  `DATABASE_URL_UNPOOLED`, and only then the pooled URL. DDL through PgBouncer
  in transaction mode fails in ways that look intermittent.

The seed is not part of the build — it is data, not schema, and it only ever
needs running when a list has genuinely changed:

    # with DATABASE_URL pointed at the hosted database
    pnpm db:seed

It loads the 227 values from `Master Listing - New.xlsx`, inserts only what is
missing and never overwrites, so it is safe to run again.

**`pnpm db:demo` refuses to run against anything that is not localhost.**
Sample stock is not real stock and has no business in a deployed database. If
you do want the demo catalogue there to show someone, load it locally and
copy it across deliberately.

## 5 · Run the functions next to the database

`vercel.json` pins `"regions": ["sin1"]`. That is not a preference; it is most
of the app's speed.

The Neon instance lives in `ap-southeast-1` — Singapore. With no region set,
Vercel runs functions in `iad1`, Washington DC, and every query then goes
India → Virginia → Singapore → Virginia → India. Measured on the deployed
site before it was fixed: one request to `/records/<id>` for an id that does
not exist took **2,558ms cold and 655ms warm**. The same query against a
local database takes **1.7ms**. Nothing was slow; it was just far away.

Opening a record ran five queries one after another, so it cost five
crossings — about six seconds.

Two things follow, and both matter if the database ever moves:

- **The region has to follow the database.** If the Neon instance is moved,
  change `regions` to match it in the same commit. They are one decision.
- **Queries that do not depend on each other should not wait for each other.**
  `loadRecord` runs its five together. That is worth doing regardless of
  distance, but at 600ms a round trip it is the difference between a screen
  that opens and one that does not.

Note that `vercel.json` is validated against a schema and unknown top-level
keys **fail the deployment** — including a `"//comment"` key, which is why
this explanation is here and not in the file.

## 6 · After that

Pushing to `main` deploys. Any other branch gets its own preview URL, which is
the safe way to look at a change before it reaches the live address.

## What will go wrong first

**Every page 500s.** `DATABASE_URL` is missing or wrong. The error says so.

**Pages load but every table is empty.** The seed has not run, or it ran
against a different database than the one Vercel is using.

**A page 500s straight after a schema change.** The build should have
migrated. Check the build log for `db:migrate` — if it was skipped, the
deployment was a preview rather than production.

**Intermittent "too many connections".** `DATABASE_URL` is pointing at the
direct port instead of the pooler.

# slk-core

The spine of the L2S system: SLK's ops platform and the Inventory API that
every other piece is a client of.

## What lives here

| Path                  | Is                                                      |
| --------------------- | ------------------------------------------------------- |
| `apps/web`            | Next.js — ops UI and the Inventory API. Sole writer of stock. |
| `apps/sync`           | Node worker — the Shopify channel bridge and transformation layer. |
| `packages/domain`     | Types, schemas, SKU and allocation rules.               |
| `packages/db`         | Drizzle schema and migrations.                          |
| `packages/contracts`  | OpenAPI spec — the API's source of truth.               |

## The invariant

**Nothing except `core` writes stock.** Not the sync worker's cache, not a
Shopify metafield, not the mobile app's offline queue. Each of those may
*propose* a change; `core` records it as a movement and everyone reads the
result back.

Stock is stored as movements and counts are derived — never
`UPDATE stock SET qty = …`. That buys an audit trail when the floor count
disagrees with the system, safe replay when a webhook arrives twice, and the
ability to answer "what did we have on the 14th" without a snapshot table.

## Getting started

```bash
pnpm install
pnpm dev
```

Requires Node >= 20.9 and pnpm 11.

## Related repositories

- `slk-mobile` — Flutter app; generates its Dart client from `packages/contracts` in CI.
- `vvis-tryon` — the try-on engine. Reads this API through a scoped key like any other client, and **must never be imported from here or import from here.**

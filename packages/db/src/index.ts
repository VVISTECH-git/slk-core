/**
 * @slk/db — Drizzle schema, migrations and the connection helper.
 *
 * Only `apps/web` writes through this. The sync worker reads and proposes;
 * every stock change is recorded as a movement by the core API so the ledger
 * has exactly one author.
 *
 * Empty until the storage decisions are settled — see
 * docs/decisions in the workspace root.
 */

export {};

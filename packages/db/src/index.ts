/**
 * @slk/db — Drizzle schema, migrations and the connection helper.
 *
 * Only `apps/web` writes through this. The sync worker reads and proposes;
 * every stock change is recorded as a movement by the core API so the ledger
 * has exactly one author.
 */

export {
  createDb,
  createSql,
  inferConnectionMode,
  type ConnectionMode,
  type CreateDbOptions,
  type Database,
} from "./client";

export { databaseUrl, directUrl } from "./env";

// Tables are exported both individually (for queries) and as a namespace
// (for `drizzle(sql, { schema })`).
export * from "./schema/index";
export * as schema from "./schema/index";

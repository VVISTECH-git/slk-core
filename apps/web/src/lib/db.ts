import { createDb, databaseUrl, type Database } from "@slk/db";

/**
 * One connection pool per server process.
 *
 * Next's dev server re-evaluates modules on every edit, so without this the
 * pool would be recreated on each hot reload and Postgres would run out of
 * connections within a few saves. Stashing it on globalThis survives that;
 * in production the module is evaluated once and the branch never matters.
 */

const globalForDb = globalThis as typeof globalThis & {
  __slkDb?: Database;
};

export const db: Database = (globalForDb.__slkDb ??= createDb({
  url: databaseUrl(),
}));

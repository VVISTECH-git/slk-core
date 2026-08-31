import { createDb, databaseUrl, type Database } from "@slk/db";

/**
 * The database handle, created on first use rather than on import.
 *
 * Two reasons it is lazy. A build has no DATABASE_URL and does not need one —
 * every page that queries is dynamic — and connecting at import time would
 * fail the build instead of the request. And Next's dev server re-evaluates
 * modules on every edit, so the pool is cached on globalThis to stop Postgres
 * running out of connections within a few saves.
 */

const globalForDb = globalThis as typeof globalThis & {
  __slkDb?: Database;
};

function resolve(): Database {
  return (globalForDb.__slkDb ??= createDb({ url: databaseUrl() }));
}

export const db: Database = new Proxy({} as Database, {
  get(_target, property) {
    const instance = resolve();
    const value = Reflect.get(instance, property, instance) as unknown;
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema/index.js";

/**
 * How the connection reaches Postgres.
 *
 * `pooled`  — through PgBouncer in transaction mode (Supabase port 6543).
 *             Right for serverless: hundreds of short-lived functions would
 *             otherwise exhaust the connection limit. Prepared statements do
 *             not survive transaction pooling, so they are turned off.
 *
 * `direct`  — a real connection to Postgres (port 5432, and local dev).
 *             Required for migrations and for the sync worker, which needs
 *             LISTEN/NOTIFY and session state that pooling discards.
 */
export type ConnectionMode = "pooled" | "direct";

export interface CreateDbOptions {
  url: string;
  /** Defaults to whatever the URL looks like — see {@link inferConnectionMode}. */
  mode?: ConnectionMode;
  /** Connections in the local pool. Defaults to 1 pooled, 10 direct. */
  max?: number;
}

/**
 * Supabase hands out the pooler on port 6543 and appends `pgbouncer=true`.
 * Anything else — including local dev on 5433 — is a direct connection.
 */
export function inferConnectionMode(url: string): ConnectionMode {
  return url.includes(":6543") || url.includes("pgbouncer=true")
    ? "pooled"
    : "direct";
}

export function createSql(options: CreateDbOptions) {
  const mode = options.mode ?? inferConnectionMode(options.url);

  return postgres(options.url, {
    max: options.max ?? (mode === "pooled" ? 1 : 10),
    prepare: mode !== "pooled",
  });
}

export function createDb(options: CreateDbOptions) {
  return drizzle(createSql(options), { schema });
}

export type Database = ReturnType<typeof createDb>;

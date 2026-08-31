/**
 * The two connection strings, kept apart on purpose.
 *
 * Mixing them up is the classic Supabase mistake: migrations run against the
 * pooler appear to work and then behave strangely, and pg-boss silently loses
 * its notifications. Reading them through these helpers means a missing value
 * fails loudly at startup rather than at the first query.
 */

function required(name: string): string {
  const value = process.env[name];

  if (value === undefined || value === "") {
    throw new Error(
      `${name} is not set. Copy .env.example to .env and fill it in.`,
    );
  }

  return value;
}

/** For the ops app and its API — the pooler in production. */
export function databaseUrl(): string {
  return required("DATABASE_URL");
}

/**
 * For migrations, Drizzle Studio and the sync worker — never the pooler.
 * Falls back to DATABASE_URL, which is correct in local development where
 * there is no pooler at all.
 */
export function directUrl(): string {
  return process.env["DIRECT_URL"] ?? databaseUrl();
}

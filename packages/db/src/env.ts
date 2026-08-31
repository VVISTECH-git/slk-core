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
      `${name} is not set. Locally, copy .env.example to .env at the ` +
        `slk-core root and fill it in. On a hosting platform, add it as an ` +
        `environment variable — the app has no database without it.`,
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
 *
 * `DATABASE_URL_UNPOOLED` is what Neon's Vercel integration sets, so the app
 * takes what the provider already gives rather than making someone copy the
 * same connection string into a second variable by hand. Falls back to
 * DATABASE_URL, which is right in local development where there is no pooler.
 */
export function directUrl(): string {
  return (
    process.env["DIRECT_URL"] ??
    process.env["DATABASE_URL_UNPOOLED"] ??
    databaseUrl()
  );
}

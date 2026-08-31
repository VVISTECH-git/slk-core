/**
 * Starts the local development Postgres.
 *
 * This is a real Postgres 17 — the same major version Supabase runs — living
 * entirely inside the repository. Nothing is installed into Windows, no
 * service starts on boot, and deleting the data directory resets everything.
 *
 *   pnpm dev:db          start it, leave it running until Ctrl-C
 *
 * The data lives in slk-core/.pgdata and is gitignored. To start from scratch,
 * stop the server and delete that folder.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

import EmbeddedPostgres from "embedded-postgres";

const DATABASE_DIR = resolve(import.meta.dirname, "../../../.pgdata");
const DATABASE_NAME = "slk";
const PORT = 5433;
const USER = "postgres";
const PASSWORD = "postgres";

const postgres = new EmbeddedPostgres({
  databaseDir: DATABASE_DIR,
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true,
  // Quiet by default — Postgres is chatty at startup and none of it is
  // interesting unless something has gone wrong.
  onLog: () => {},
  onError: (message) => {
    console.error("[db]", message);
  },
});

async function main(): Promise<void> {
  const isFirstRun = !existsSync(DATABASE_DIR);

  if (isFirstRun) {
    console.log("[db] first run — creating the cluster, this takes a moment");
    await postgres.initialise();
  }

  await postgres.start();

  if (isFirstRun) {
    await postgres.createDatabase(DATABASE_NAME);
    console.log(`[db] created database "${DATABASE_NAME}"`);
  }

  console.log(
    `[db] ready on postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${DATABASE_NAME}`,
  );
  console.log("[db] Ctrl-C to stop");

  await new Promise<void>((resolvePromise) => {
    const shutdown = () => {
      console.log("\n[db] stopping");
      void postgres.stop().then(resolvePromise, resolvePromise);
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}

main().catch((error: unknown) => {
  console.error("[db] failed to start", error);
  process.exitCode = 1;
});

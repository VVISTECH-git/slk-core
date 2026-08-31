/**
 * Loads the controlled vocabulary into whichever database DATABASE_URL points
 * at.
 *
 *   pnpm db:seed
 *
 * Safe to run repeatedly: it inserts what is missing and never overwrites a
 * value that already exists, so a rename made in the app survives a re-seed.
 */

import { resolve } from "node:path";

import { config } from "dotenv";

import { createDb, databaseUrl } from "../src/index";
import { seedMasterListing } from "../src/seed/run";

// scripts/ → packages/db → packages → slk-core
config({ path: resolve(import.meta.dirname, "../../../.env") });

async function main(): Promise<void> {
  const db = createDb({ url: databaseUrl(), mode: "direct" });

  console.log("[seed] loading Master Listing - New.xlsx vocabulary");
  const report = await seedMasterListing(db);

  console.log(
    `[seed] lists   ${report.listsInserted} inserted, ${report.listsExisting} already present`,
  );
  console.log(
    `[seed] values  ${report.valuesInserted} inserted, ${report.valuesExisting} already present`,
  );

  process.exit(0);
}

main().catch((error: unknown) => {
  console.error("[seed] failed", error);
  process.exit(1);
});

/**
 * Loads sample stock so the ops screens have something to show.
 *
 *   pnpm db:demo
 *
 * Not idempotent — every run adds another set of designs, because the design
 * code carries a sequence number and two runs are genuinely two batches.
 * Refuses to touch anything that is not a local database.
 */

import { resolve } from "node:path";

import { config } from "dotenv";

import { createDb, databaseUrl } from "../src/index";
import { loadDemoStock } from "../src/seed/demo";

config({ path: resolve(import.meta.dirname, "../../../.env") });

async function main(): Promise<void> {
  const url = databaseUrl();

  if (!/localhost|127\.0\.0\.1/.test(url)) {
    console.error("[demo] refusing to load sample stock into a remote database");
    process.exit(1);
  }

  const db = createDb({ url, mode: "direct" });

  console.log("[demo] loading sample stock");
  const report = await loadDemoStock(db);

  console.log(
    `[demo] ${report.designs} designs · ${report.colourways} colourways · ` +
      `${report.pieces} pieces · ${report.movements} movements`,
  );

  if (report.unresolved.length > 0) {
    console.log("[demo] not in the workbook, stored as null:");
    for (const note of report.unresolved) console.log(`         ${note}`);
  }

  process.exit(0);
}

main().catch((error: unknown) => {
  console.error("[demo] failed", error);
  process.exit(1);
});

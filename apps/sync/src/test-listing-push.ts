import { resolve } from "node:path";

import { config } from "dotenv";
import { sql } from "drizzle-orm";

import { createDb, directUrl } from "@slk/db";

import { pushListingForColourway } from "./publish-listing";

config({ path: resolve(process.cwd(), "../../.env") });

/**
 * Calls pushListingForColourway directly for one consignment's colourway —
 * the same thing saving a record now triggers automatically (saveRecord,
 * setBatchListing, confirmImage, ...) — without needing an actual edit
 * through the ops app UI first.
 *
 *   pnpm --filter @slk/sync test-listing-push <productCode>
 *   e.g. pnpm --filter @slk/sync test-listing-push 300010
 *
 * Proves the harder half: the query, the composition, and the Shopify call
 * all work. It cannot prove the after() hook itself fires from a real save
 * — that still needs someone to actually edit a record in the app.
 */

const [productCode] = process.argv.slice(2);

if (productCode === undefined) {
  console.error("\n  Usage: pnpm --filter @slk/sync test-listing-push <productCode>\n");
  process.exit(1);
}

// mode deliberately not forced — see the same note in publish.ts.
const db = createDb({ url: directUrl() });

try {
  const [row] = await db.execute<{ colourway_id: string }>(sql`
    select colourway_id from batch where code = ${productCode}
  `);

  if (row === undefined) throw new Error(`No consignment ${productCode}.`);

  console.log(`\n  Pushing listing for colourway ${row.colourway_id} (from ${productCode})...\n`);

  const results = await pushListingForColourway(db, row.colourway_id);

  if (results.length === 0) {
    console.log("  Nothing to push — no channel has this colourway linked yet.\n");
  } else {
    for (const r of results) {
      console.log(
        r.error
          ? `  ${r.channelCode} ${r.productCode}: FAILED — ${r.error}`
          : `  ${r.channelCode} ${r.productCode}: OK`,
      );
    }
    console.log("");
  }
} catch (error) {
  console.error("\n  ── ERROR ──────────────────────────────────");
  let current: unknown = error;
  let depth = 0;
  while (current instanceof Error && depth < 6) {
    console.error(`  ${current.constructor.name}: ${current.message}`);
    const extra = current as unknown as Record<string, unknown>;
    for (const key of ["code", "detail", "hint", "severity", "routine", "constraint_name", "column_name", "table_name"]) {
      if (extra[key] !== undefined) console.error(`    ${key}: ${extra[key]}`);
    }
    current = extra["cause"];
    depth++;
  }
  if (!(error instanceof Error)) console.error(`  ${String(error)}`);
  console.error("  ───────────────────────────────────────────\n");
  process.exitCode = 1;
} finally {
  await db.$client.end({ timeout: 5 });
}

import { config } from "dotenv";
import postgres from "postgres";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), "../../.env") });

/**
 * Empties the catalogue — designs, colourways, pieces, consignments and the
 * whole movement ledger — and leaves everything else standing.
 *
 * What survives is what is not sample data: the controlled vocabulary, the
 * locations, and the code sequences. The vocabulary is the workbook and took
 * real work to transcribe; the locations are where stock lives; and the
 * sequences deliberately do not rewind, because a product code that has been
 * printed must never be handed out twice even if the record behind it is
 * gone.
 *
 * Refuses to run against anything but localhost, for the same reason
 * `db:demo` does. This deletes a catalogue.
 */

const url = process.env["DATABASE_URL"] ?? "";

if (!/localhost|127\.0\.0\.1/.test(url)) {
  const host = url.replace(/^.*@/, "").replace(/[/?].*$/, "");
  console.error(
    `\n  Refusing to run against ${host || "an unset DATABASE_URL"}.\n` +
      `  This empties the catalogue, and only a local database is fair game.\n`,
  );
  process.exit(1);
}

const sql = postgres(url);

const before = await sql`
  select
    (select count(*)::int from design)    as designs,
    (select count(*)::int from colourway) as colourways,
    (select count(*)::int from piece)     as pieces,
    (select count(*)::int from movement)  as movements,
    (select count(*)::int from batch)     as batches,
    (select count(*)::int from image)     as images
`;

console.table(before);

await sql.begin(async (tx) => {
  // The ledger refuses UPDATE and DELETE by trigger — that is the guarantee
  // that a count can always be explained. Emptying a demo catalogue is the
  // one legitimate exception, so the guard is lifted deliberately and put
  // back inside the same transaction rather than left off.
  await tx`ALTER TABLE movement DISABLE TRIGGER movement_no_change`;

  await tx`DELETE FROM movement`;
  await tx`DELETE FROM piece`;
  await tx`DELETE FROM batch`;
  await tx`DELETE FROM image`;
  await tx`DELETE FROM colourway`;
  await tx`DELETE FROM design`;

  await tx`ALTER TABLE movement ENABLE TRIGGER movement_no_change`;
});

const after = await sql`
  select
    (select count(*)::int from design)       as designs,
    (select count(*)::int from movement)     as movements,
    (select count(*)::int from lookup_value) as vocabulary,
    (select count(*)::int from location)     as locations,
    (select last_value from product_code_seq) as "nextProductCode",
    (select last_value from item_code_seq)    as "nextItemCode"
`;

console.log("\nEmptied. What is left:");
console.table(after);

await sql.end();

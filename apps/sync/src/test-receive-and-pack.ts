import { resolve } from "node:path";

import { config } from "dotenv";
import { sql } from "drizzle-orm";

import { createDb, directUrl } from "@slk/db";

import { pushInventoryForColourway } from "./inventory-push";

config({ path: resolve(process.cwd(), "../../.env") });

/**
 * Receives test stock for a colourway, then packs the oldest held
 * reservation against it — the two manual UI steps ("Record movement →
 * Received", then "Picking List → Pack") done together in one script, the
 * same role publish-one and test-webhook play for their own paths.
 *
 *   pnpm --filter @slk/sync test-receive-and-pack <productCode> <qty> <locationCode>
 *   e.g. pnpm --filter @slk/sync test-receive-and-pack 300010 3 WH-MAIN
 *
 * Reuses exactly the logic actions.ts's openConsignment and
 * picking/actions.ts's packReservation use — the same sequences, the same
 * CHECK-constrained reservation transition — just invoked directly instead
 * of through an authenticated session, which is the one thing this script
 * exists to route around.
 */

const [productCode, qtyArg, locationCode] = process.argv.slice(2);

if (productCode === undefined || qtyArg === undefined || locationCode === undefined) {
  console.error(
    "\n  Usage: pnpm --filter @slk/sync test-receive-and-pack <productCode> <qty> <locationCode>\n" +
      "  e.g.   pnpm --filter @slk/sync test-receive-and-pack 300010 3 WH-MAIN\n",
  );
  process.exit(1);
}

const qty = Number(qtyArg);
if (!Number.isFinite(qty) || qty <= 0) {
  console.error("\n  qty must be a positive number.\n");
  process.exit(1);
}

const db = createDb({ url: directUrl() });

try {
  const [batch] = await db.execute<{ colourwayId: string; designName: string }>(sql`
    select b.colourway_id as "colourwayId", d.name as "designName"
    from batch b
    join colourway cw on cw.id = b.colourway_id
    join design d on d.id = cw.design_id
    where b.code = ${productCode}
  `);
  if (batch === undefined) throw new Error(`No consignment ${productCode}.`);

  const [location] = await db.execute<{ id: string; name: string }>(sql`
    select id, name from location where code = ${locationCode} and is_internal
  `);
  if (location === undefined) throw new Error(`No internal location with code ${locationCode}.`);

  const [production] = await db.execute<{ id: string }>(sql`
    select id from location where code = 'PRODUCTION'
  `);
  if (production === undefined) throw new Error("No PRODUCTION location is set up.");

  // ── Receive: same shape as openConsignment in records/actions.ts ────────

  const [newBatch] = await db.execute<{ id: string; code: string }>(sql`
    insert into batch (colourway_id, code, qty, location_id, reference, note)
    values (
      ${batch.colourwayId},
      nextval('product_code_seq')::text,
      ${qty}, ${location.id}, 'test-receive-and-pack', 'Test stock for picking-list verification'
    )
    returning id, code
  `);
  if (newBatch === undefined) throw new Error("Could not open a consignment.");

  const [design] = await db.execute<{ isSerialised: boolean }>(sql`
    select d.is_serialised as "isSerialised"
    from colourway cw join design d on d.id = cw.design_id
    where cw.id = ${batch.colourwayId}
  `);

  if (design?.isSerialised === true) {
    const [next] = await db.execute<{ max: number }>(sql`
      select coalesce(max(serial), 0)::int as max from piece where colourway_id = ${batch.colourwayId}
    `);

    await db.execute(sql`
      insert into piece (colourway_id, batch_id, code, serial)
      select ${batch.colourwayId}, ${newBatch.id}, nextval('item_code_seq')::text, ${next?.max ?? 0} + g
      from generate_series(1, ${qty}) as g
    `);
  }

  await db.execute(sql`
    insert into movement (colourway_id, batch_id, qty, kind, from_location_id, to_location_id, occurred_at, reference)
    values (${batch.colourwayId}, ${newBatch.id}, ${qty}, 'received', ${production.id}, ${location.id}, now(), 'test-receive-and-pack')
  `);

  console.log(`\n  Received ${qty} of ${batch.designName} into ${location.name} — consignment ${newBatch.code}.`);

  // ── Pack: same transaction shape as picking/actions.ts's packReservation ─

  const [reservation] = await db.execute<{ id: string; qty: number; externalOrderName: string | null }>(sql`
    select r.id, r.qty, r.external_order_name as "externalOrderName"
    from reservation r
    join batch b on b.id = r.batch_id
    where r.status = 'held' and b.colourway_id = ${batch.colourwayId}
    order by r.created_at asc
    limit 1
  `);

  if (reservation === undefined) {
    console.log("  No held reservation for this colourway — stock received, nothing to pack.\n");
  } else {
    const [customer] = await db.execute<{ id: string }>(sql`select id from location where code = 'CUSTOMER'`);
    if (customer === undefined) throw new Error("No CUSTOMER location is set up.");

    const [claimed] = await db.execute<{ qty: number; externalOrderName: string | null }>(sql`
      update reservation set status = 'fulfilled', updated_at = now()
      where id = ${reservation.id} and status = 'held'
      returning qty, external_order_name as "externalOrderName"
    `);

    if (claimed === undefined) {
      console.log("  Reservation was claimed by something else between reading and packing it — nothing done.\n");
    } else {
      await db.execute(sql`
        insert into movement (colourway_id, qty, kind, from_location_id, to_location_id, occurred_at, reference)
        values (${batch.colourwayId}, ${claimed.qty}, 'sold', ${location.id}, ${customer.id}, now(), ${claimed.externalOrderName})
      `);

      console.log(`  Packed ${claimed.qty} from ${location.name}${claimed.externalOrderName ? ` for ${claimed.externalOrderName}` : ""} — reservation fulfilled.\n`);

      const results = await pushInventoryForColourway(db, batch.colourwayId);
      for (const r of results) {
        console.log(r.error ? `  ${r.channelCode}: FAILED — ${r.error}` : `  ${r.channelCode}: inventory pushed OK`);
      }
      console.log("");
    }
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

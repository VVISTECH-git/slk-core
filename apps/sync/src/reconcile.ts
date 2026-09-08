import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { config } from "dotenv";
import { sql } from "drizzle-orm";

import { createDb, directUrl, type Database } from "@slk/db";

import { fulfillReservationLine } from "./fulfillment";
import { pushInventoryForColourway } from "./inventory-push";
import { shopifyClient } from "./shopify-client";
import { demoteOversoldHolds, HANDLED_TOPICS, handleWebhookPayload } from "./webhook-handlers";

/**
 * The nightly correction pass the rest of the bridge was written to lean on.
 *
 * Three things drift on their own and nothing else re-checks them:
 *
 *   1. A `pushInventoryForColourway` call that failed — a Shopify outage, a
 *      dropped connection — leaves `channel_link.last_push_error` set and the
 *      count exactly as wrong as it was at the moment of failure. Nothing
 *      about the next sale fixes an *earlier* miss; it only pushes the count
 *      current as of itself.
 *   2. A webhook whose handler threw is recorded in `channel_event` with
 *      `error` set and `processed_at` left null (see the route's own
 *      comment on why it still answers Shopify with 200 rather than asking
 *      Shopify to retry). Nothing polls that table today.
 *   3. `packReservation`'s call to `fulfillReservationLine` runs in `after()`
 *      — after the response that told the floor the pack succeeded — so a
 *      failure there (or the function never getting to run at all) leaves
 *      `reservation.status = 'fulfilled'` with `fulfilled_at` still null: the
 *      piece left the shelf, our ledger is right, and Shopify's own order
 *      still says "Unfulfilled" forever with nothing watching for it.
 *   4. Two channels sharing a physical shelf (SLK's own store and Aartisanz,
 *      both drawing on the same Hyderabad stock) can each book a hold on the
 *      same last piece within the same few seconds — Shopify captures
 *      payment before either storefront can ask this codebase for
 *      permission, so `bookReservation`'s own guard, in
 *      `demoteOversoldHolds`, can still miss a race that lands between one
 *      webhook's insert and its own follow-up check. Run again here, over
 *      every batch with any open hold, as the backstop for whatever that
 *      per-webhook pass didn't catch.
 *
 * All four are repaired the same way any other correction in this codebase
 * is: by recomputing from the source of truth, not by trusting a cached
 * delta. Every linked colourway's sellable count is pushed again in full — a
 * colourway with nothing actually wrong just gets the same number sent
 * twice, which is harmless — every failed event is replayed through the
 * identical handler the live webhook route uses, from `webhook-handlers.ts`,
 * every unconfirmed fulfilment is retried through the identical call
 * `packReservation` makes, from `fulfillment.ts`, and every held reservation
 * is re-ranked against its pool's true physical count through the identical
 * check the webhook route itself runs after every booking.
 */

export interface ReconcileSummary {
  inventory: {
    colourways: number;
    failures: { colourwayId: string; channelCode: string; error: string }[];
  };
  events: {
    retried: number;
    stillFailing: { eventId: string; topic: string; error: string }[];
  };
  fulfillments: {
    retried: number;
    stillFailing: { reservationId: string; sku: string; error: string }[];
  };
  oversold: {
    released: { channelId: string; externalOrderName: string | null; batchId: string; qty: number }[];
  };
}

export async function runReconciliation(db: Database): Promise<ReconcileSummary> {
  const linked = await db.execute<{ colourwayId: string }>(sql`
    select distinct b.colourway_id as "colourwayId"
    from channel_link cl
    join batch b on b.id = cl.batch_id
    where cl.shopify_inventory_item_id is not null
  `);

  const inventoryFailures: ReconcileSummary["inventory"]["failures"] = [];

  for (const row of linked) {
    const results = await pushInventoryForColourway(db, row.colourwayId);
    for (const result of results) {
      if (result.error !== undefined) {
        inventoryFailures.push({
          colourwayId: row.colourwayId,
          channelCode: result.channelCode,
          error: result.error,
        });
      }
    }
  }

  const failedEvents = await db.execute<{
    id: string;
    channelId: string;
    topic: string;
    payload: Record<string, unknown>;
  }>(sql`
    select id, channel_id as "channelId", topic, payload
    from channel_event
    where error is not null and processed_at is null
    order by received_at asc
  `);

  let retried = 0;
  const stillFailing: ReconcileSummary["events"]["stillFailing"] = [];

  for (const event of failedEvents) {
    // A topic outside HANDLED_TOPICS never gets `error` set in the first
    // place (the route marks it processed, not failed) — this is only a
    // guard against a future topic being added to one set and not the other.
    if (!HANDLED_TOPICS.has(event.topic)) continue;

    try {
      await handleWebhookPayload(db, event.channelId, event.topic, event.payload);

      await db.execute(sql`
        update channel_event set processed_at = now(), error = null where id = ${event.id}
      `);
      retried++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      await db.execute(sql`update channel_event set error = ${message} where id = ${event.id}`);
      stillFailing.push({ eventId: event.id, topic: event.topic, error: message });
    }
  }

  const unconfirmed = await db.execute<{
    id: string;
    qty: number;
    externalOrderId: string;
    channelCode: string;
    sku: string;
  }>(sql`
    select r.id, r.qty, r.external_order_id as "externalOrderId", ch.code as "channelCode", b.code as sku
    from reservation r
    join batch b   on b.id = r.batch_id
    join channel ch on ch.id = r.channel_id
    where r.status = 'fulfilled' and r.fulfilled_at is null
    order by r.updated_at asc
  `);

  let fulfillmentsRetried = 0;
  const fulfillmentsStillFailing: ReconcileSummary["fulfillments"]["stillFailing"] = [];

  for (const reservation of unconfirmed) {
    try {
      const client = await shopifyClient(reservation.channelCode);
      const result = await fulfillReservationLine(client, {
        externalOrderId: reservation.externalOrderId,
        sku: reservation.sku,
        quantity: reservation.qty,
      });

      if (result.ok) {
        await db.execute(sql`
          update reservation set fulfilled_at = now(), fulfillment_error = null
          where id = ${reservation.id}
        `);
        fulfillmentsRetried++;
      } else {
        const message = result.error ?? "Unknown error";
        await db.execute(sql`
          update reservation set fulfillment_error = ${message} where id = ${reservation.id}
        `);
        fulfillmentsStillFailing.push({ reservationId: reservation.id, sku: reservation.sku, error: message });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db.execute(sql`
        update reservation set fulfillment_error = ${message} where id = ${reservation.id}
      `);
      fulfillmentsStillFailing.push({ reservationId: reservation.id, sku: reservation.sku, error: message });
    }
  }

  const heldBatches = await db.execute<{ batchId: string }>(sql`
    select distinct batch_id as "batchId" from reservation where status = 'held'
  `);

  const oversold = await demoteOversoldHolds(
    db,
    heldBatches.map((r) => r.batchId),
  );

  for (const loser of oversold) {
    console.error(
      `[oversell] released ${loser.qty} of batch ${loser.batchId} held by ` +
        `channel ${loser.channelId}, order ${loser.externalOrderName ?? loser.externalOrderId} — ` +
        `already committed to an earlier order on the same shared stock.`,
    );
  }

  return {
    inventory: { colourways: linked.length, failures: inventoryFailures },
    events: { retried, stillFailing },
    fulfillments: { retried: fulfillmentsRetried, stillFailing: fulfillmentsStillFailing },
    oversold: {
      released: oversold.map((loser) => ({
        channelId: loser.channelId,
        externalOrderName: loser.externalOrderName,
        batchId: loser.batchId,
        qty: loser.qty,
      })),
    },
  };
}

// Runs the pass standalone (`pnpm --filter @slk/sync reconcile`) without
// opening a database connection just because something imported this
// module — the cron route imports `runReconciliation` directly and brings
// its own `db`.
const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  config({ path: resolve(process.cwd(), "../../.env") });
  const db = createDb({ url: directUrl() });

  try {
    const summary = await runReconciliation(db);

    console.log(
      `\n  Inventory: recomputed ${summary.inventory.colourways} colourway(s), ${summary.inventory.failures.length} failure(s).`,
    );
    for (const f of summary.inventory.failures) {
      console.log(`    ${f.channelCode} / ${f.colourwayId}: ${f.error}`);
    }

    console.log(
      `  Events: retried ${summary.events.retried}, ${summary.events.stillFailing.length} still failing.`,
    );
    for (const f of summary.events.stillFailing) {
      console.log(`    ${f.topic} / ${f.eventId}: ${f.error}`);
    }

    console.log(
      `  Fulfilments: confirmed ${summary.fulfillments.retried}, ${summary.fulfillments.stillFailing.length} still failing.`,
    );
    for (const f of summary.fulfillments.stillFailing) {
      console.log(`    ${f.sku} / ${f.reservationId}: ${f.error}`);
    }

    console.log(`  Oversold: released ${summary.oversold.released.length} hold(s).`);
    for (const o of summary.oversold.released) {
      console.log(
        `    batch ${o.batchId}, channel ${o.channelId}, order ${o.externalOrderName ?? "(unnamed)"}, qty ${o.qty}`,
      );
    }
    console.log("");
  } catch (error) {
    console.error("\n  ── ERROR ──────────────────────────────────");
    console.error(error);
    console.error("  ───────────────────────────────────────────\n");
    process.exitCode = 1;
  } finally {
    await db.$client.end({ timeout: 5 });
  }
}

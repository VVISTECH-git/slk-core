"use server";

import { actingId, guard } from "@/lib/session";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { movement } from "@slk/db";
import { pushInventoryForColourway } from "@slk/sync/inventory-push";

import { db } from "@/lib/db";

import type { ActionResult } from "../records/actions";

/**
 * Turns a held reservation into an actual movement — the one step the
 * bridge never does on its own, deliberately: nothing physical happens when
 * an order arrives, so nothing is written to the ledger until somebody
 * here says the piece has actually left. See "An order reserves; packing
 * moves" in the 3 Sep design.
 *
 * Same movement kind ("sold") a retail sale writes, same guard against
 * sending out more than a location actually holds — packing a Shopify
 * order is not a different kind of event from a walk-in sale, only a
 * different reason it happened.
 *
 * Deliberately not one db.transaction() wrapping the claim, the stock
 * check and the insert — that hung indefinitely in production, every
 * time, on the third statement, the one live query against `db` in this
 * whole app that opens a real multi-statement transaction. `db` here
 * connects through DATABASE_URL, the pooler — everywhere else in this app
 * (@slk/sync, migrations, Drizzle Studio) that needs actual transactional
 * semantics goes through DIRECT_URL instead, for exactly this reason; see
 * packages/db's own env.ts. Reproduced with a live pg_stat_activity check:
 * the backend sat "idle in transaction" / ClientRead forever right after
 * that query, meaning Postgres had already answered and was waiting on
 * the app to speak next — a driver/pooler mismatch, not a slow query.
 *
 * Sequential statements instead, each already safe alone: the claim is
 * still one atomic UPDATE ... WHERE status = 'held', so a second caller
 * racing the first still gets zero rows back rather than double-claiming.
 * The one new failure mode a transaction would have rolled back on its
 * own — claimed, but rejected on the stock check — is handled by hand,
 * putting the reservation back to 'held' rather than leaving it stranded
 * as 'fulfilled' with nothing to show for it.
 */
class PackRejected extends Error {}

export async function packReservation(
  reservationId: string,
  locationId: string,
): Promise<ActionResult> {
  const denied = await guard("floor");
  if (denied !== null) return denied;

  const [picked] = await db.execute<{ id: string; name: string }>(sql`
    select id, name from location where id = ${locationId} and is_internal
  `);
  if (picked === undefined) return { ok: false, message: "Choose a location." };

  const [customer] = await db.execute<{ id: string }>(sql`
    select id from location where code = 'CUSTOMER'
  `);
  if (customer === undefined) {
    return { ok: false, message: "No CUSTOMER location is set up. Add one on Locations." };
  }

  let colourwayId = "";
  let packedQty = 0;
  let externalOrderName: string | null = null;

  // Atomic claim: this UPDATE only succeeds once. A second caller's
  // WHERE status = 'held' matches nothing the moment the first commits,
  // so it gets zero rows back rather than racing the write below.
  const [claimed] = await db.execute<{
    qty: number;
    batchId: string;
    externalOrderName: string | null;
  }>(sql`
    update reservation set status = 'fulfilled', updated_at = now()
    where id = ${reservationId} and status = 'held'
    returning qty, batch_id as "batchId", external_order_name as "externalOrderName"
  `);

  if (claimed === undefined) {
    return {
      ok: false,
      message: "That order is not waiting to be packed — somebody may already have packed it.",
    };
  }

  try {
    const [batch] = await db.execute<{ colourwayId: string }>(sql`
      select colourway_id as "colourwayId" from batch where id = ${claimed.batchId}
    `);
    if (batch === undefined) throw new PackRejected("That consignment no longer exists.");

    // Same check recordMovement makes: cannot send out more than this
    // location actually holds of this colourway.
    const [held] = await db.execute<{ qty: number }>(sql`
      select (
        coalesce((select sum(m.qty)::int from movement m
                  where m.colourway_id = ${batch.colourwayId} and m.to_location_id = ${locationId}), 0)
      - coalesce((select sum(m.qty)::int from movement m
                  where m.colourway_id = ${batch.colourwayId} and m.from_location_id = ${locationId}), 0)
      ) as qty
    `);
    const available = held?.qty ?? 0;

    if (claimed.qty > available) {
      throw new PackRejected(
        available === 0
          ? `There is nothing at ${picked.name} to pack this from.`
          : `Only ${available} at ${picked.name} — this order needs ${claimed.qty}.`,
      );
    }

    await db.insert(movement).values({
      colourwayId: batch.colourwayId,
      qty: claimed.qty,
      kind: "sold",
      fromLocationId: locationId,
      toLocationId: customer.id,
      occurredAt: new Date(),
      reference: claimed.externalOrderName,
      note: null,
      actorId: await actingId(),
    });

    colourwayId = batch.colourwayId;
    packedQty = claimed.qty;
    externalOrderName = claimed.externalOrderName;
  } catch (error) {
    // The claim already happened as its own statement — nothing to roll
    // back automatically, so undo it by hand before answering. Still the
    // same reservation, still safe to try again.
    await db.execute(sql`
      update reservation set status = 'held', updated_at = now()
      where id = ${reservationId} and status = 'fulfilled'
    `);

    if (error instanceof PackRejected) return { ok: false, message: error.message };
    throw error;
  }

  // Same fire-and-forget push recordMovement uses — a Shopify hiccup here
  // must never undo the pack that already happened.
  after(() =>
    pushInventoryForColourway(db, colourwayId)
      .then((results) => {
        for (const r of results) {
          if (r.error) console.error(`[inventory-push] ${r.channelCode}: ${r.error}`);
        }
      })
      .catch((error: unknown) => console.error("[inventory-push] failed", error)),
  );

  revalidatePath("/picking");
  revalidatePath("/records");

  return {
    ok: true,
    message: `Packed ${packedQty} from ${picked.name}${externalOrderName ? ` for ${externalOrderName}` : ""}.`,
  };
}

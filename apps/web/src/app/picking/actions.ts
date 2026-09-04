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
 */
/** Thrown inside the transaction to reject cleanly, without rolling back into a 500. */
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

  try {
    // Everything inside one transaction: claiming the reservation, checking
    // stock and writing the movement either all happen or none do. Without
    // this, a second click (or a second person) racing the first between
    // the status check and the write could pack the same order twice — the
    // ledger would show two movements for one physical piece leaving.
    await db.transaction(async (tx) => {
      // Atomic claim: this UPDATE only succeeds once. A second caller's
      // WHERE status = 'held' matches nothing the moment the first commits,
      // so it gets zero rows back rather than racing the write below.
      const [claimed] = await tx.execute<{
        qty: number;
        batchId: string;
        externalOrderName: string | null;
      }>(sql`
        update reservation set status = 'fulfilled', updated_at = now()
        where id = ${reservationId} and status = 'held'
        returning qty, batch_id as "batchId", external_order_name as "externalOrderName"
      `);

      if (claimed === undefined) {
        throw new PackRejected(
          "That order is not waiting to be packed — somebody may already have packed it.",
        );
      }

      const [batch] = await tx.execute<{ colourwayId: string }>(sql`
        select colourway_id as "colourwayId" from batch where id = ${claimed.batchId}
      `);
      if (batch === undefined) throw new PackRejected("That consignment no longer exists.");

      // Same check recordMovement makes: cannot send out more than this
      // location actually holds of this colourway.
      const [held] = await tx.execute<{ qty: number }>(sql`
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

      await tx.insert(movement).values({
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
    });
  } catch (error) {
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

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
export async function packReservation(
  reservationId: string,
  locationId: string,
): Promise<ActionResult> {
  const denied = await guard("floor");
  if (denied !== null) return denied;

  const [reservation] = await db.execute<{
    batchId: string;
    colourwayId: string;
    qty: number;
    status: string;
    externalOrderName: string | null;
  }>(sql`
    select
      r.batch_id as "batchId",
      b.colourway_id as "colourwayId",
      r.qty,
      r.status,
      r.external_order_name as "externalOrderName"
    from reservation r
    join batch b on b.id = r.batch_id
    where r.id = ${reservationId}
  `);

  if (reservation === undefined) {
    return { ok: false, message: "That order no longer exists." };
  }
  if (reservation.status !== "held") {
    return { ok: false, message: "That order is not waiting to be packed." };
  }

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

  // Same check recordMovement makes: cannot send out more than this
  // location actually holds of this colourway.
  const [held] = await db.execute<{ qty: number }>(sql`
    select (
      coalesce((select sum(m.qty)::int from movement m
                where m.colourway_id = ${reservation.colourwayId} and m.to_location_id = ${locationId}), 0)
    - coalesce((select sum(m.qty)::int from movement m
                where m.colourway_id = ${reservation.colourwayId} and m.from_location_id = ${locationId}), 0)
    ) as qty
  `);
  const available = held?.qty ?? 0;

  if (reservation.qty > available) {
    return {
      ok: false,
      message:
        available === 0
          ? `There is nothing at ${picked.name} to pack this from.`
          : `Only ${available} at ${picked.name} — this order needs ${reservation.qty}.`,
    };
  }

  await db.insert(movement).values({
    colourwayId: reservation.colourwayId,
    qty: reservation.qty,
    kind: "sold",
    fromLocationId: locationId,
    toLocationId: customer.id,
    occurredAt: new Date(),
    reference: reservation.externalOrderName,
    note: null,
    actorId: await actingId(),
  });

  await db.execute(sql`
    update reservation set status = 'fulfilled', updated_at = now()
    where id = ${reservationId}
  `);

  // Same fire-and-forget push recordMovement uses — a Shopify hiccup here
  // must never undo the pack that already happened.
  after(() =>
    pushInventoryForColourway(db, reservation.colourwayId)
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
    message: `Packed ${reservation.qty} from ${picked.name}${reservation.externalOrderName ? ` for ${reservation.externalOrderName}` : ""}.`,
  };
}

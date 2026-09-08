import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import type { Database } from "@slk/db";

import { shopifyClient } from "./shopify-client";

export interface PushResult {
  channelCode: string;
  batches: number;
  error?: string;
}

// A type alias, not an interface: db.execute<T> requires T assignable to
// Record<string, unknown>, which an object type alias gets implicitly and
// an interface does not — see the same note on ShotListRow in shot-list.ts.
type SellableRow = {
  channel_id: string;
  channel_code: string;
  batch_id: string;
  shopify_inventory_item_id: string;
  sellable: number | null;
};

/**
 * Records whether this attempt reached Shopify, on every `channel_link` row
 * it touched — one call's worth of "was told about it and it worked (or did
 * not)", written durably instead of only to `console.error`. `error: null`
 * clears a previous failure the same way a good push should.
 */
async function markPushed(
  db: Database,
  items: SellableRow[],
  error: string | null,
): Promise<void> {
  if (items.length === 0) return;

  const batchIds = sql.join(items.map((i) => sql`${i.batch_id}`), sql`, `);

  await db.execute(sql`
    update channel_link set
      last_push_error = ${error},
      last_pushed_at = now()
    where channel_id = ${items[0]!.channel_id} and batch_id in (${batchIds})
  `);
}

/**
 * Recomputes and pushes the sellable count for every consignment of this
 * colourway that is actually listed somewhere, on every channel it is
 * listed on.
 *
 * Takes a colourway, not a batch: recordMovement writes a quantity-based
 * sale, not a scan, so it never says which specific consignment physically
 * left — piece_position allocates the change oldest-batch-first (see the
 * 3 Sep design), which can shift `channel_batch_sellable` for every batch of
 * this colourway, not just one. Recomputing the whole colourway is the only
 * way to stay honest with what that view is actually saying.
 *
 * Fire-and-forget from the caller's point of view — a Shopify or network
 * failure here must never be why a sale failed, so every failure is caught
 * per channel and returned rather than thrown, left for the next sale (or
 * the reconciliation job once one exists) to correct on its own.
 */
export async function pushInventoryForColourway(
  db: Database,
  colourwayId: string,
): Promise<PushResult[]> {
  const rows = await db.execute<SellableRow>(sql`
    select
      ch.id   as channel_id,
      ch.code as channel_code,
      cl.batch_id,
      cl.shopify_inventory_item_id,
      cbs.sellable
    from channel_link cl
    join channel ch on ch.id = cl.channel_id
    join batch b   on b.id = cl.batch_id
    join channel_batch_sellable cbs
      on cbs.channel_id = cl.channel_id and cbs.batch_id = cl.batch_id
    where b.colourway_id = ${colourwayId}
      and cl.shopify_inventory_item_id is not null
  `);

  if (rows.length === 0) return [];

  const byChannel = new Map<string, SellableRow[]>();
  for (const row of rows) {
    const list = byChannel.get(row.channel_code) ?? [];
    list.push(row);
    byChannel.set(row.channel_code, list);
  }

  const results: PushResult[] = [];

  for (const [channelCode, items] of byChannel) {
    try {
      const client = await shopifyClient(channelCode);

      // One location per store today — the same simplification publish.ts
      // makes, and for the same reason: nothing yet asks a channel to split
      // its sellable number across more than one Shopify location.
      const { locations } = await client.graphql<{ locations: { nodes: { id: string }[] } }>(
        `query { locations(first: 1) { nodes { id } } }`,
      );
      const location = locations.nodes[0];
      if (location === undefined) throw new Error("store has no locations");

      /*
        inventorySetQuantities is a compare-and-set: it requires
        changeFromQuantity — what it currently believes the level is — and
        rejects the call without it. Confirmed against Shopify's own schema
        via introspection, not a doc guess. One query per item rather than
        trusting a locally-cached number, since this push runs precisely
        because something changed and a stale belief here would make the
        very check meant to catch a race fail to catch it.
      */
      const withCurrent = await Promise.all(
        items.map(async (i) => {
          const { inventoryItem } = await client.graphql<{
            inventoryItem: {
              inventoryLevel: { quantities: { quantity: number }[] } | null;
            } | null;
          }>(
            `query($id: ID!, $locationId: ID!) {
              inventoryItem(id: $id) {
                inventoryLevel(locationId: $locationId) {
                  quantities(names: ["available"]) { quantity }
                }
              }
            }`,
            { id: i.shopify_inventory_item_id, locationId: location.id },
          );

          return {
            ...i,
            current: inventoryItem?.inventoryLevel?.quantities[0]?.quantity ?? 0,
          };
        }),
      );

      /*
        @idempotent needs a literal key on the field, not a variable — found
        by introspecting Shopify's own schema for its exact syntax rather
        than guessing after the first rejection. A fresh key every call:
        this push is a fresh recompute each time, not a retry of a specific
        earlier attempt, so there is nothing to deliberately de-duplicate
        against.
      */
      const idempotencyKey = randomUUID();
      const INVENTORY_SET = `
        mutation InventorySet($input: InventorySetQuantitiesInput!) {
          inventorySetQuantities(input: $input) @idempotent(key: "${idempotencyKey}") {
            userErrors { field message }
          }
        }
      `;

      const result = await client.graphql<{
        inventorySetQuantities: { userErrors: { field: string[]; message: string }[] };
      }>(INVENTORY_SET, {
        input: {
          name: "available",
          reason: "correction",
          quantities: withCurrent.map((i) => ({
            inventoryItemId: i.shopify_inventory_item_id,
            locationId: location.id,
            quantity: i.sellable ?? 0,
            changeFromQuantity: i.current,
          })),
        },
      });

      if (result.inventorySetQuantities.userErrors.length > 0) {
        throw new Error(
          result.inventorySetQuantities.userErrors
            .map((e) => `${e.field.join(".")}: ${e.message}`)
            .join("; "),
        );
      }

      await markPushed(db, items, null);
      results.push({ channelCode, batches: items.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      await markPushed(db, items, message);
      results.push({ channelCode, batches: items.length, error: message });
    }
  }

  return results;
}

import { sql } from "drizzle-orm";

import type { Database } from "@slk/db";

import { shopifyClient } from "./shopify-client";

export interface PushResult {
  channelCode: string;
  batches: number;
  error?: string;
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
  // A type alias, not an interface: db.execute<T> requires T assignable to
  // Record<string, unknown>, which an object type alias gets implicitly and
  // an interface does not — see the same note on ShotListRow in shot-list.ts.
  type SellableRow = {
    channel_code: string;
    shopify_inventory_item_id: string;
    sellable: number | null;
  };

  const rows = await db.execute<SellableRow>(sql`
    select
      ch.code as channel_code,
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

      const INVENTORY_SET = `
        mutation InventorySet($input: InventorySetQuantitiesInput!) {
          inventorySetQuantities(input: $input) {
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
          // No prior quantity to compare against — this is a fresh
          // recompute from the ledger, not an incremental adjustment.
          ignoreCompareQuantity: true,
          quantities: items.map((i) => ({
            inventoryItemId: i.shopify_inventory_item_id,
            locationId: location.id,
            quantity: i.sellable ?? 0,
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

      results.push({ channelCode, batches: items.length });
    } catch (error) {
      results.push({
        channelCode,
        batches: items.length,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

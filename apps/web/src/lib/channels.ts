import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

/**
 * Every consignment each channel could sell, and whether it is listed there.
 *
 * The sellable numbers come straight from `channel_batch_sellable` — proof
 * the count is right before the bridge sends it to Shopify (the 3 Sep
 * design). The listing state comes from `channel_link`, which the publish
 * action writes; a row without one has never been put on that channel.
 *
 * Restricted to live stock the same way Product Management is: an archived
 * design or a retired colourway has nothing to sell and nothing to list.
 */

export interface ChannelSellableRow {
  channelId: string;
  channelCode: string;
  channelName: string;
  batchId: string;
  productCode: string;
  designCode: string;
  designName: string;
  colour: string | null;
  isSerialised: boolean;
  onHand: number | null;
  reserved: number | null;
  sellable: number | null;
  /** Paise. Null means the publish action will refuse it. */
  retailMinor: number | null;
  /** Photographs actually uploaded for this colourway. */
  photos: number;
  /** Null until the consignment has been published to this channel. */
  shopifyProductId: string | null;
  /** When it was last published or republished there — ISO, or null. */
  listedAt: string | null;
}

export async function loadChannelSellable(): Promise<ChannelSellableRow[]> {
  const rows = await db.execute<{
    channel_id: string;
    channel_code: string;
    channel_name: string;
    batch_id: string;
    product_code: string;
    design_code: string;
    design_name: string;
    colour: string | null;
    is_serialised: boolean;
    on_hand: number | null;
    reserved: number | null;
    sellable: number | null;
    retail_minor: number | null;
    photos: number;
    shopify_product_id: string | null;
    listed_at: string | null;
  }>(sql`
    select
      cbs.channel_id,
      ch.code        as channel_code,
      ch.name        as channel_name,
      cbs.batch_id,
      cbs.code       as product_code,
      d.code         as design_code,
      d.name         as design_name,
      colour.label   as colour,
      cbs.is_serialised,
      cbs.on_hand,
      cbs.reserved,
      cbs.sellable,
      bp.retail_minor,
      (
        select count(*)::int from image i
        where i.colourway_id = cw.id and i.storage_key is not null
      )              as photos,
      cl.shopify_product_id,
      cl.updated_at  as listed_at
    from channel_batch_sellable cbs
    join channel ch     on ch.id = cbs.channel_id
    join colourway cw   on cw.id = cbs.colourway_id
    join design d       on d.id  = cw.design_id
    left join lookup_value colour on colour.id = cw.colour_id
    left join batch_price bp      on bp.batch_id = cbs.batch_id
    left join channel_link cl     on cl.channel_id = cbs.channel_id and cl.batch_id = cbs.batch_id
    where d.status <> 'archived' and cw.is_active
    order by ch.code, d.code, cbs.code
  `);

  return rows.map((r) => ({
    channelId: r.channel_id,
    channelCode: r.channel_code,
    channelName: r.channel_name,
    batchId: r.batch_id,
    productCode: r.product_code,
    designCode: r.design_code,
    designName: r.design_name,
    colour: r.colour,
    isSerialised: r.is_serialised,
    onHand: r.on_hand,
    reserved: r.reserved,
    sellable: r.sellable,
    retailMinor: r.retail_minor,
    photos: r.photos,
    shopifyProductId: r.shopify_product_id,
    listedAt: r.listed_at === null ? null : new Date(r.listed_at).toISOString(),
  }));
}

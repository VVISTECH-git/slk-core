import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

/**
 * What a channel could sell right now, read straight from
 * `channel_batch_sellable` — proof the numbers are right before the bridge
 * ever calls Shopify with them. See the 3 Sep design.
 *
 * Restricted to live stock the same way Product Management is: an archived
 * design or a retired colourway has nothing to prove here, and would just be
 * noise on a screen meant to answer "is this number correct".
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
      cbs.sellable
    from channel_batch_sellable cbs
    join channel ch     on ch.id = cbs.channel_id
    join colourway cw   on cw.id = cbs.colourway_id
    join design d       on d.id  = cw.design_id
    left join lookup_value colour on colour.id = cw.colour_id
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
  }));
}

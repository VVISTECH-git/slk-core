import { sql } from "drizzle-orm";

import type { Database } from "@slk/db";

import { sendProductSet, type ConsignmentRow, type PhotoRow } from "./product-set";
import { shopifyClient } from "./shopify-client";

export interface PushResult {
  channelCode: string;
  productCode: string;
  error?: string;
}

/**
 * Republishes every consignment of this colourway that is already listed
 * somewhere, on every channel it is listed on — title, description, price,
 * weight, HSN, tags and photographs, plus the current inventory count, all
 * in the one productSet call that already does this for publish-one.
 *
 * Whole colourway, same reasoning as pushInventoryForColourway: title and
 * description compose from fields that live on the design and the
 * colourway, so an edit there changes what every batch of this colourway
 * ought to say on Shopify, not just whichever one somebody happened to be
 * looking at.
 *
 * Only ever updates. A consignment with no channel_link yet has never been
 * published, and this is not the path that publishes one for the first
 * time — that stays publish-one, run by hand, deliberately: the first
 * listing of something is a decision, not a side effect of editing a price.
 *
 * Fire-and-forget from the caller — see recordMovement's use of
 * pushInventoryForColourway for the same reasoning. A Shopify failure here
 * must never be why saving a record failed.
 */
export async function pushListingForColourway(
  db: Database,
  colourwayId: string,
): Promise<PushResult[]> {
  const r2Base = process.env["R2_PUBLIC_BASE_URL"];
  if (r2Base === undefined || r2Base === "") {
    return [{ channelCode: "*", productCode: "*", error: "R2_PUBLIC_BASE_URL is not set." }];
  }
  const base = r2Base.replace(/\/$/, "");

  type Row = ConsignmentRow & {
    channel_id: string;
    channel_code: string;
    batch_id: string;
    product_code: string;
    shopify_product_id: string;
    retail_minor: number | null;
    sellable: number | null;
  };

  const rows = await db.execute<Row>(sql`
    select
      cl.channel_id,
      ch.code                as channel_code,
      b.id                   as batch_id,
      b.code                 as product_code,
      cl.shopify_product_id,
      bp.retail_minor,
      cbs.sellable,
      d.name                 as design_name,
      product_type.label     as product_type,
      b.title                 as title_override,
      b.description           as description_override,
      b.weight_grams,
      b.hsn_code,
      colour.label              as colour,
      colour2.label             as secondary_colour,
      craft.label                as craft_technique,
      material.label              as textile_material,
      fibre.label                  as fibre_type,
      motif.label                  as motif,
      motif_cat.label               as motif_category,
      border_h.label                 as border_height,
      border_s.label                  as border_style,
      pallu.label                      as pallu_design,
      blouse_avail.label                as blouse_available,
      blouse_style.label                 as blouse_style,
      blouse_material.label               as blouse_material
    from channel_link cl
    join channel ch    on ch.id = cl.channel_id
    join batch b        on b.id = cl.batch_id
    join colourway cw    on cw.id = b.colourway_id
    join design d          on d.id = cw.design_id
    join batch_price bp     on bp.batch_id = b.id
    join channel_batch_sellable cbs on cbs.channel_id = cl.channel_id and cbs.batch_id = b.id
    left join lookup_value product_type  on product_type.id  = d.product_type_id
    left join lookup_value colour        on colour.id        = cw.colour_id
    left join lookup_value colour2       on colour2.id       = cw.secondary_colour_id
    left join lookup_value craft         on craft.id         = d.craft_technique_id
    left join lookup_value material      on material.id      = d.textile_material_id
    left join lookup_value fibre         on fibre.id         = d.fibre_type_id
    left join lookup_value motif         on motif.id         = d.motif_id
    left join lookup_value motif_cat     on motif_cat.id     = d.motif_category_id
    left join lookup_value border_h      on border_h.id      = d.border_height_id
    left join lookup_value border_s      on border_s.id      = d.border_style_id
    left join lookup_value pallu         on pallu.id         = d.pallu_design_id
    left join lookup_value blouse_avail  on blouse_avail.id  = d.blouse_available_id
    left join lookup_value blouse_style  on blouse_style.id  = d.blouse_style_id
    left join lookup_value blouse_material on blouse_material.id = d.blouse_material_id
    where b.colourway_id = ${colourwayId}
      and cl.shopify_product_id is not null
  `);

  if (rows.length === 0) return [];

  const photos = await db.execute<PhotoRow>(sql`
    select slot.label as slot, i.storage_key, i.alt as alt_override
    from image i
    left join lookup_value slot on slot.id = i.slot_id
    where i.colourway_id = ${colourwayId} and i.storage_key is not null
    order by i.sort_order
  `);

  const results: PushResult[] = [];

  for (const row of rows) {
    if (row.retail_minor === null) {
      results.push({
        channelCode: row.channel_code,
        productCode: row.product_code,
        error: "No retail price, on the batch or the line.",
      });
      continue;
    }

    try {
      const client = await shopifyClient(row.channel_code);
      const sent = await sendProductSet(
        client,
        row.product_code,
        row,
        photos,
        base,
        row.retail_minor,
        row.sellable ?? 0,
        row.shopify_product_id,
      );

      await db.execute(sql`
        update channel_link set
          shopify_variant_id = ${sent.variantId},
          shopify_inventory_item_id = ${sent.inventoryItemId},
          updated_at = now()
        where channel_id = ${row.channel_id} and batch_id = ${row.batch_id}
      `);

      results.push({ channelCode: row.channel_code, productCode: row.product_code });
    } catch (error) {
      results.push({
        channelCode: row.channel_code,
        productCode: row.product_code,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

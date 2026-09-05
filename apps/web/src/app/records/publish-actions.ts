"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { sendProductSet, type ConsignmentRow, type PhotoRow } from "@slk/sync/product-set";
import { shopifyClient } from "@slk/sync/shopify-client";

import { db } from "@/lib/db";
import { guard } from "@/lib/session";

import type { ActionResult } from "./actions";

/**
 * Puts one consignment on one channel, by hand, from the record it already
 * came from — the UI equivalent of apps/sync's publish-one script, which
 * until now was the only way to do this at all. A new record was never
 * short a "Publish" button by accident: the first listing of something is a
 * decision, not a side effect of saving a price (see product-set.ts) — this
 * is that decision, made explicit, rather than automatic.
 *
 * office and above only, matching archiveRecord: putting something in front
 * of a real customer is a bigger call than floor staff correcting their own
 * entry.
 */
export async function publishBatchToChannel(
  batchId: string,
  channelCode: string,
): Promise<ActionResult> {
  const denied = await guard("office");
  if (denied !== null) return denied;

  const [row] = await db.execute<
    ConsignmentRow & {
      batch_id: string;
      channel_id: string;
      colourway_id: string;
      product_code: string;
      is_serialised: boolean;
      sellable: number | null;
      retail_minor: number | null;
    }
  >(sql`
    select
      b.id                as batch_id,
      b.code              as product_code,
      ch.id               as channel_id,
      cw.id               as colourway_id,
      d.name              as design_name,
      product_type.label  as product_type,
      d.is_serialised,
      cbs.sellable,
      bp.retail_minor,
      b.title             as title_override,
      b.description       as description_override,
      b.weight_grams,
      b.hsn_code,
      colour.label         as colour,
      colour2.label        as secondary_colour,
      craft.label           as craft_technique,
      material.label         as textile_material,
      fibre.label            as fibre_type,
      motif.label            as motif,
      motif_cat.label         as motif_category,
      border_h.label          as border_height,
      border_s.label          as border_style,
      pallu.label             as pallu_design,
      blouse_avail.label      as blouse_available,
      blouse_style.label      as blouse_style,
      blouse_material.label   as blouse_material
    from batch b
    join colourway cw on cw.id = b.colourway_id
    join design d     on d.id  = cw.design_id
    join channel ch   on ch.code = ${channelCode}
    join channel_batch_sellable cbs on cbs.batch_id = b.id and cbs.channel_id = ch.id
    join batch_price bp on bp.batch_id = b.id
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
    where b.id = ${batchId}
  `);

  if (row === undefined) {
    return { ok: false, message: `Not on ${channelCode} — no channel by that code, or this consignment doesn't exist.` };
  }

  if (!row.is_serialised) {
    return {
      ok: false,
      message: `${row.product_code} is a pooled product type — there's no honest per-consignment count for it yet.`,
    };
  }

  if (row.retail_minor === null) {
    return { ok: false, message: `${row.product_code} has no retail price. Set one first.` };
  }

  const r2Base = process.env["R2_PUBLIC_BASE_URL"];
  if (r2Base === undefined || r2Base === "") {
    return { ok: false, message: "Images aren't configured (R2_PUBLIC_BASE_URL is not set) — ask a developer." };
  }

  const photos = await db.execute<PhotoRow>(sql`
    select slot.label as slot, i.storage_key, i.alt as alt_override
    from image i
    left join lookup_value slot on slot.id = i.slot_id
    where i.colourway_id = ${row.colourway_id} and i.storage_key is not null
    order by i.sort_order
  `);

  const [existingLink] = await db.execute<{ shopify_product_id: string }>(sql`
    select shopify_product_id from channel_link
    where channel_id = ${row.channel_id} and batch_id = ${row.batch_id}
  `);

  try {
    const client = await shopifyClient(channelCode);
    const sent = await sendProductSet(
      client,
      row.product_code,
      row,
      photos,
      r2Base.replace(/\/$/, ""),
      row.retail_minor,
      row.sellable ?? 0,
      existingLink?.shopify_product_id,
    );

    await db.execute(sql`
      insert into channel_link (channel_id, batch_id, shopify_product_id, shopify_variant_id, shopify_inventory_item_id)
      values (${row.channel_id}, ${row.batch_id}, ${sent.productId}, ${sent.variantId}, ${sent.inventoryItemId})
      on conflict (channel_id, batch_id) do update set
        shopify_product_id = excluded.shopify_product_id,
        shopify_variant_id = excluded.shopify_variant_id,
        shopify_inventory_item_id = excluded.shopify_inventory_item_id,
        updated_at = now()
    `);

    revalidatePath("/records");
    revalidatePath("/channels");

    return {
      ok: true,
      message: existingLink !== undefined
        ? `Republished ${row.product_code} on ${channelCode}.`
        : `Published ${row.product_code} on ${channelCode} as "${sent.title}".`,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

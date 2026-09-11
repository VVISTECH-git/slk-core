import { sql } from "drizzle-orm";

import { sendProductSet, type ConsignmentRow, type PhotoRow } from "@slk/sync/product-set";
import { shopifyClient } from "@slk/sync/shopify-client";

import { db } from "@/lib/db";

/**
 * Publishes one consignment to one channel over HTTP — the exact same query
 * and `sendProductSet` call `apps/sync/src/publish.ts` runs by hand from a
 * terminal, reachable as a request instead so a script outside this
 * deployment (nothing here has Shopify's client secret) can drive a bulk
 * publish a handful of consignments at a time, one request each, safely
 * inside a single serverless invocation's time budget.
 *
 * `ADMIN_TASK_SECRET` gated, the same shape as the reconcile cron route's
 * own guard — this is not reachable by a signed-in floor/office/owner
 * session, on purpose: it exists for exactly one kind of caller, an
 * operator running a one-off bulk job, not the app itself.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env["ADMIN_TASK_SECRET"];
  if (secret === undefined || secret === "") {
    return new Response("Not configured.", { status: 503 });
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized.", { status: 401 });
  }

  const url = new URL(request.url);
  const channelCode = url.searchParams.get("channel");
  const productCode = url.searchParams.get("code");

  if (channelCode === null || productCode === null) {
    return new Response("Pass ?channel= and ?code=.", { status: 400 });
  }

  try {
    const client = await shopifyClient(channelCode);

    const [row] = await db.execute<
      ConsignmentRow & {
        batch_id: string;
        channel_id: string;
        colourway_id: string;
        is_serialised: boolean;
        sellable: number | null;
        retail_minor: number | null;
      }
    >(sql`
      select
        b.id                as batch_id,
        ch.id               as channel_id,
        cw.id               as colourway_id,
        d.name              as design_name,
        product_type.label  as product_type,
        d.is_serialised,
        d.extra,
        cbs.sold_by_metre,
        cbs.sellable,
        bp.retail_minor,
        b.title             as title_override,
        b.description       as description_override,
        b.weight_grams,
        b.hsn_code,
        colour.label         as colour,
        colour2.label        as secondary_colour,
        prod_method.label     as production_method,
        craft.label           as craft_technique,
        craft_sub.label        as craft_sub_type,
        material.label         as textile_material,
        fibre.label            as fibre_type,
        weave.label             as weave_structure,
        motif.label            as motif,
        motif_cat.label         as motif_category,
        saree_style.label        as saree_style,
        pallu_motif.label         as pallu_motif,
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
      left join lookup_value prod_method   on prod_method.id   = d.production_method_id
      left join lookup_value craft         on craft.id         = d.craft_technique_id
      left join lookup_value craft_sub     on craft_sub.id     = d.craft_sub_type_id
      left join lookup_value material      on material.id      = d.textile_material_id
      left join lookup_value fibre         on fibre.id         = d.fibre_type_id
      left join lookup_value weave         on weave.id         = d.weave_structure_id
      left join lookup_value motif         on motif.id         = d.motif_id
      left join lookup_value motif_cat     on motif_cat.id     = d.motif_category_id
      left join lookup_value saree_style   on saree_style.id   = d.saree_style_id
      left join lookup_value pallu_motif   on pallu_motif.id   = d.pallu_motif_id
      left join lookup_value border_h      on border_h.id      = d.border_height_id
      left join lookup_value border_s      on border_s.id      = d.border_style_id
      left join lookup_value pallu         on pallu.id         = d.pallu_design_id
      left join lookup_value blouse_avail  on blouse_avail.id  = d.blouse_available_id
      left join lookup_value blouse_style  on blouse_style.id  = d.blouse_style_id
      left join lookup_value blouse_material on blouse_material.id = d.blouse_material_id
      where b.code = ${productCode}
    `);

    if (row === undefined) {
      return Response.json(
        { ok: false, error: `No consignment ${productCode}, or no channel "${channelCode}".` },
        { status: 404 },
      );
    }

    if (!row.is_serialised) {
      return Response.json(
        { ok: false, error: `${productCode} is a pooled product type — cannot list per batch.` },
        { status: 422 },
      );
    }

    if (row.retail_minor === null) {
      return Response.json(
        { ok: false, error: `${productCode} has no retail price.` },
        { status: 422 },
      );
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

    const base = (process.env["R2_PUBLIC_BASE_URL"] ?? "").replace(/\/$/, "");
    if (base === "") {
      return Response.json({ ok: false, error: "R2_PUBLIC_BASE_URL is not set." }, { status: 500 });
    }

    const sent = await sendProductSet(
      client,
      channelCode,
      productCode,
      row,
      photos,
      base,
      row.retail_minor,
      row.sellable ?? 0,
      existingLink?.shopify_product_id,
      // Always ACTIVE — an operator's bulk publish job, not a review step.
      "ACTIVE",
    );

    await db.execute(sql`
      insert into channel_link (channel_id, batch_id, shopify_product_id, shopify_variant_id, shopify_inventory_item_id, shopify_status)
      values (${row.channel_id}, ${row.batch_id}, ${sent.productId}, ${sent.variantId}, ${sent.inventoryItemId}, 'active')
      on conflict (channel_id, batch_id) do update set
        shopify_product_id = excluded.shopify_product_id,
        shopify_variant_id = excluded.shopify_variant_id,
        shopify_inventory_item_id = excluded.shopify_inventory_item_id,
        shopify_status = excluded.shopify_status,
        updated_at = now()
    `);

    return Response.json({
      ok: true,
      productCode,
      channelCode,
      title: sent.title,
      productId: sent.productId,
      created: existingLink === undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

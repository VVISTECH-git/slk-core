import { resolve } from "node:path";

import { config } from "dotenv";
import { sql } from "drizzle-orm";

import { createDb, directUrl } from "@slk/db";

import { sendProductSet } from "./product-set";
import { shopifyClient } from "./shopify-client";

config({ path: resolve(process.cwd(), "../../.env") });

/**
 * Step 5 of the 3 Sep design ("Batch as Listing") — publish one consignment
 * to one Shopify store, by hand, no queue.
 *
 *   pnpm --filter @slk/sync publish-one <channelCode> <productCode>
 *   e.g. pnpm --filter @slk/sync publish-one aartisanz 300019
 *
 * The point of doing this by hand once is to confirm the credentials, the
 * image upload and the inventory mapping actually work before any of it is
 * automatic — see DEPLOY.md's own point about a green build proving nothing
 * about whether the thing it built is right.
 *
 * Writes a channel_link row on success so a second run of the same
 * consignment updates the Shopify product instead of creating a duplicate —
 * that part is not built yet (this is the *first* run), so re-running today
 * will create a second product. Worth fixing before step 6.
 *
 * This never writes stock. It reads channel_batch_sellable — already the
 * ledger's own answer to "what can this channel sell" — and tells Shopify
 * that number. If the number is wrong, the bug is upstream of this script.
 */

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is not set.`);
  }
  return value;
}

// mode deliberately not forced to "direct": if DIRECT_URL turns out to
// actually be a pooled connection string (easy to grab the wrong one out of
// a dozen similarly-named Postgres vars), createSql's own inference from the
// hostname is what protects against the failure DEPLOY.md warns about —
// prepared statements silently breaking over PgBouncer's transaction
// pooling, in a way that looks like an intermittent, unrelated bug.
const db = createDb({ url: directUrl() });

/*
  Everything lives inside main() and every exit is a thrown error, not
  process.exit() — calling that while the postgres connection is still open
  is what was crashing Node on Windows (a libuv assertion, after the real
  error had already printed). One try/finally below closes the connection
  on every path, success or failure, before the process is allowed to end.
*/
async function main(): Promise<void> {
  const [channelCode, productCode] = process.argv.slice(2);

  if (channelCode === undefined || productCode === undefined) {
    throw new Error("Usage: pnpm --filter @slk/sync publish-one <channelCode> <productCode>");
  }

  const client = await shopifyClient(channelCode);

  const [row] = await db.execute<{
    batch_id: string;
    channel_id: string;
    colourway_id: string;
    design_name: string;
    is_serialised: boolean;
    sellable: number | null;
    retail_minor: number | null;
    currency: string;
    title_override: string | null;
    description_override: string | null;
    weight_grams: number | null;
    hsn_code: string | null;
    colour: string | null;
    secondary_colour: string | null;
    craft_technique: string | null;
    textile_material: string | null;
    fibre_type: string | null;
    motif: string | null;
    motif_category: string | null;
    border_height: string | null;
    border_style: string | null;
    pallu_design: string | null;
    blouse_available: string | null;
    blouse_style: string | null;
    blouse_material: string | null;
  }>(sql`
    select
      b.id                as batch_id,
      ch.id               as channel_id,
      cw.id               as colourway_id,
      d.name              as design_name,
      d.is_serialised,
      cbs.sellable,
      bp.retail_minor,
      bp.currency,
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
    where b.code = ${productCode}
  `);

  if (row === undefined) {
    throw new Error(`No consignment ${productCode}, or no channel "${channelCode}".`);
  }

  if (!row.is_serialised) {
    throw new Error(
      `${productCode} is a pooled product type — channel_batch_sellable has no honest ` +
        `number for it. Only serialised designs can be listed per batch today.`,
    );
  }

  if (row.retail_minor === null) {
    throw new Error(`${productCode} has no retail price, on the batch or the line. Set one first.`);
  }

  const photos = await db.execute<{ slot: string | null; storage_key: string; alt_override: string | null }>(sql`
    select slot.label as slot, i.storage_key, i.alt as alt_override
    from image i
    left join lookup_value slot on slot.id = i.slot_id
    where i.colourway_id = ${row.colourway_id} and i.storage_key is not null
    order by i.sort_order
  `);

  // A second run of the same consignment updates the product it already
  // made rather than creating a sibling — this is the whole reason
  // channel_link exists (see the schema comment on it).
  const [existingLink] = await db.execute<{ shopify_product_id: string }>(sql`
    select shopify_product_id from channel_link
    where channel_id = ${row.channel_id} and batch_id = ${row.batch_id}
  `);

  const base = required("R2_PUBLIC_BASE_URL").replace(/\/$/, "");

  console.log(`\n  ${productCode} — sellable ${row.sellable}, ${photos.length} photograph(s) at ${channelCode}`);
  console.log(existingLink !== undefined
    ? `  Already listed as ${existingLink.shopify_product_id} — updating it.\n`
    : `  Not listed yet — creating.\n`);

  const sent = await sendProductSet(
    client,
    productCode,
    row,
    photos,
    base,
    row.retail_minor!,
    row.sellable ?? 0,
    existingLink?.shopify_product_id,
  );

  console.log(`\n  ${sent.title}`);
  console.log(`  ${existingLink !== undefined ? "Updated" : "Created"}: https://${client.domain}/admin/products/${sent.productId.split("/").pop()}\n`);

  await db.execute(sql`
    insert into channel_link (channel_id, batch_id, shopify_product_id, shopify_variant_id, shopify_inventory_item_id)
    values (${row.channel_id}, ${row.batch_id}, ${sent.productId}, ${sent.variantId}, ${sent.inventoryItemId})
    on conflict (channel_id, batch_id) do update set
      shopify_product_id = excluded.shopify_product_id,
      shopify_variant_id = excluded.shopify_variant_id,
      shopify_inventory_item_id = excluded.shopify_inventory_item_id,
      updated_at = now()
  `);

  console.log("  channel_link written.\n");
}

try {
  await main();
} catch (error) {
  /*
    Drizzle wraps the driver's own error in DrizzleQueryError, with the real
    thing — a postgres.js PostgresError, code/detail/hint and all — sitting
    on .cause rather than replacing the outer message. Printing only the
    outer error hid it twice already; walking the whole cause chain is what
    actually gets to it.
  */
  console.error("\n  ── ERROR ──────────────────────────────────");
  let current: unknown = error;
  let depth = 0;
  while (current instanceof Error && depth < 6) {
    console.error(`  ${current.constructor.name}: ${current.message}`);
    const extra = current as unknown as Record<string, unknown>;
    for (const key of ["code", "detail", "hint", "severity", "routine", "constraint_name", "column_name", "table_name"]) {
      if (extra[key] !== undefined) console.error(`    ${key}: ${extra[key]}`);
    }
    current = extra["cause"];
    depth++;
  }
  if (!(error instanceof Error)) console.error(`  ${String(error)}`);
  console.error("  ───────────────────────────────────────────\n");
  process.exitCode = 1;
} finally {
  // $client is drizzle-orm's escape hatch to the underlying postgres-js
  // connection — closing it is what lets Node exit on its own rather than
  // hanging on an open socket or, on Windows, crashing on it.
  await db.$client.end({ timeout: 5 });
}

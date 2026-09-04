import { resolve } from "node:path";

import { config } from "dotenv";
import { sql } from "drizzle-orm";

import { listingAlt, listingDescription, listingTitle } from "@slk/domain";
import { createDb, directUrl } from "@slk/db";

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

  const PREFIX = channelCode.toUpperCase();
  // Tolerate the value someone copies from a browser address bar — protocol
  // and trailing slash are the obvious mistake, not a different store.
  const domain = required(`SHOPIFY_${PREFIX}_STORE_DOMAIN`)
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  const apiVersion = process.env["SHOPIFY_API_VERSION"] ?? "2026-07";

  /*
    This store has no legacy custom-app flow left — Dev Dashboard only, which
    means no static Admin API token to hand a script. The Client ID + Secret
    pair (the app's own Credentials, not the "App automation token" — that
    one is scoped to CLI deploys, not general Admin API calls) exchanges for
    a real access token via OAuth's client_credentials grant: no browser, no
    callback URL, right for an app with exactly one installer.
  */
  const clientId = required(`SHOPIFY_${PREFIX}_CLIENT_ID`);
  const clientSecret = required(`SHOPIFY_${PREFIX}_CLIENT_SECRET`);

  const tokenRes = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });

  const tokenBody = (await tokenRes.json()) as { access_token?: string; error?: string; error_description?: string };

  if (!tokenRes.ok || tokenBody.access_token === undefined) {
    throw new Error(
      `Token exchange ${tokenRes.status}: ${tokenBody.error ?? ""} ${tokenBody.error_description ?? JSON.stringify(tokenBody)}`,
    );
  }

  const token = tokenBody.access_token;

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

  const base = required("R2_PUBLIC_BASE_URL").replace(/\/$/, "");

  const title = row.title_override ?? listingTitle({
    designName: row.design_name,
    colour: row.colour,
    secondaryColour: row.secondary_colour,
  });

  const description = row.description_override ?? listingDescription({
    craftTechnique: row.craft_technique,
    textileMaterial: row.textile_material,
    fibreType: row.fibre_type,
    motif: row.motif,
    motifCategory: row.motif_category,
    borderHeight: row.border_height,
    borderStyle: row.border_style,
    palluDesign: row.pallu_design,
    blouseAvailable: row.blouse_available,
    blouseStyle: row.blouse_style,
    blouseMaterial: row.blouse_material,
  });

  console.log(`\n  ${productCode} — ${title}`);
  console.log(`  ${photos.length} photograph(s), sellable ${row.sellable} at ${channelCode}\n`);

  // ── Shopify ────────────────────────────────────────────────────────────

  async function shopify<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const res = await fetch(`https://${domain}/admin/api/${apiVersion}/graphql.json`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-shopify-access-token": token,
      },
      body: JSON.stringify({ query, variables }),
    });

    const body = (await res.json()) as { data?: T; errors?: unknown };

    if (!res.ok || body.errors) {
      throw new Error(`Shopify ${res.status}: ${JSON.stringify(body.errors ?? body)}`);
    }

    return body.data as T;
  }

  const { locations } = await shopify<{ locations: { nodes: { id: string; name: string }[] } }>(
    `query { locations(first: 10) { nodes { id name } } }`,
    {},
  );

  if (locations.nodes.length === 0) {
    throw new Error("This Shopify store has no locations at all — nothing to set inventory against.");
  }

  if (locations.nodes.length > 1) {
    console.log("  More than one Shopify location exists; using the first:");
    for (const l of locations.nodes) console.log(`    ${l.id}  ${l.name}`);
  }

  const location = locations.nodes[0]!;

  const PRODUCT_SET = `
    mutation PublishConsignment($input: ProductSetInput!) {
      productSet(input: $input, synchronous: true) {
        product {
          id
          handle
          variants(first: 1) {
            nodes { id inventoryItem { id } }
          }
        }
        userErrors { field message }
      }
    }
  `;

  const result = await shopify<{
    productSet: {
      product: {
        id: string;
        handle: string;
        variants: { nodes: { id: string; inventoryItem: { id: string } }[] };
      } | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>(PRODUCT_SET, {
    input: {
      title,
      descriptionHtml: description,
      vendor: "Sree Lakshmi Kalamkari",
      status: "ACTIVE",
      tags: [row.colour, row.craft_technique, row.textile_material ?? row.fibre_type, row.motif].filter(
        (t): t is string => t !== null,
      ),
      productOptions: [{ name: "Title", values: [{ name: "Default Title" }] }],
      variants: [
        {
          optionValues: [{ optionName: "Title", name: "Default Title" }],
          price: (row.retail_minor! / 100).toFixed(2),
          sku: productCode,
          inventoryItem: {
            tracked: true,
            sku: productCode,
            ...(row.weight_grams !== null && {
              measurement: { weight: { value: row.weight_grams, unit: "GRAMS" } },
            }),
          },
          inventoryQuantities: [
            { locationId: location.id, name: "available", quantity: row.sellable ?? 0 },
          ],
        },
      ],
      files: photos.map((p) => ({
        originalSource: `${base}/${p.storage_key}`,
        alt: p.alt_override ?? listingAlt({ colour: row.colour, designName: row.design_name, slot: p.slot }),
        contentType: "IMAGE",
      })),
    },
  });

  if (result.productSet.userErrors.length > 0) {
    throw new Error(
      "Shopify refused it:\n" +
        result.productSet.userErrors.map((e) => `    ${e.field.join(".")}: ${e.message}`).join("\n"),
    );
  }

  const product = result.productSet.product!;
  const variant = product.variants.nodes[0];

  if (variant === undefined) {
    throw new Error(`Shopify accepted the product but returned no variant — nothing to link. Product: ${product.id}`);
  }

  console.log(`\n  Created: https://${domain}/admin/products/${product.id.split("/").pop()}\n`);

  await db.execute(sql`
    insert into channel_link (channel_id, batch_id, shopify_product_id, shopify_variant_id, shopify_inventory_item_id)
    values (${row.channel_id}, ${row.batch_id}, ${product.id}, ${variant.id}, ${variant.inventoryItem.id})
  `);

  console.log("  channel_link written — a second run of this consignment would now need to update, not create.\n");
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

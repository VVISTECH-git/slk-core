import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { publicUrl } from "@/lib/storage";

/**
 * One product, by the code on its label, for another application to read.
 *
 * Tantu needs a merchant's garment photographs to generate model imagery from,
 * and SLK already has them: the photographs uploaded against a consignment,
 * slot by slot — Body, Pallu, Border, Blouse — plus the shopper-facing text.
 * Asking someone to download and re-upload the same four files is the kind of
 * step that quietly does not get done.
 *
 * `ADMIN_TASK_SECRET` gated, the same shape as the publish-one route: this is
 * for one machine calling another, not for a signed-in session, and it is
 * deliberately not reachable by floor/office/owner cookies.
 *
 * Read-only. It writes nothing and takes no action.
 */

interface ProductRow extends Record<string, unknown> {
  productCode: string;
  colourwayId: string;
  title: string | null;
  description: string | null;
  designCode: string;
  designName: string;
  colour: string | null;
  productType: string | null;
  motif: string | null;
  motifCategory: string | null;
  qty: number;
}

interface ImageRow extends Record<string, unknown> {
  slot: string | null;
  storageKey: string | null;
  width: number | null;
  height: number | null;
  alt: string | null;
}

/**
 * What the storefront would say when nobody has written anything.
 *
 * Not the Shopify composition, which needs a channel and a price band this
 * caller has neither of — just enough for a person to recognise the product
 * they typed a code for.
 */
function composedTitle(row: ProductRow): string {
  // The design name already carries the product type — "Kalamkari Cotton
  // Saree" — so appending it again reads "… Saree Saree". Only added when the
  // name does not already end in it.
  const name = row.designName;
  const type = row.productType;
  const needsType =
    type !== null && !name.toLowerCase().endsWith(type.toLowerCase());
  return [row.colour, name, needsType ? type : null].filter(Boolean).join(" ");
}

export async function GET(request: Request): Promise<Response> {
  const secret = process.env["ADMIN_TASK_SECRET"];
  if (secret === undefined || secret === "") {
    return new Response("Not configured.", { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized.", { status: 401 });
  }

  const code = decodeURIComponent(
    new URL(request.url).pathname.split("/").pop() ?? "",
  ).trim();

  // Same rule as the piece lookup: our codes are minted from sequences, so
  // anything else is not ours, and saying so beats an empty result.
  if (!/^\d{1,12}$/.test(code)) {
    return Response.json({ error: "That is not an SLK code." }, { status: 400 });
  }

  const rows = await db.execute<ProductRow>(sql`
    select
      b.code              as "productCode",
      cw.id               as "colourwayId",
      b.title,
      b.description,
      d.code              as "designCode",
      d.name              as "designName",
      colour.label        as colour,
      product_type.label  as "productType",
      motif.label         as motif,
      motif_cat.label     as "motifCategory",
      b.qty
    from batch b
    join colourway cw on cw.id = b.colourway_id
    join design d     on d.id  = cw.design_id
    left join lookup_value colour       on colour.id       = cw.colour_id
    left join lookup_value product_type on product_type.id = d.product_type_id
    left join lookup_value motif        on motif.id        = d.motif_id
    left join lookup_value motif_cat    on motif_cat.id    = d.motif_category_id
    where b.code = ${code}
    limit 1
  `);

  const product = rows[0];
  if (product === undefined) {
    return Response.json({ error: `No product carries the code ${code}.` }, { status: 404 });
  }

  const images = await db.execute<ImageRow>(sql`
    select
      slot.label     as slot,
      i.storage_key  as "storageKey",
      i.width,
      i.height,
      i.alt
    from image i
    left join lookup_value slot on slot.id = i.slot_id
    where i.colourway_id = ${product.colourwayId}
      and i.storage_key is not null
    order by i.sort_order, slot.label
  `);

  return Response.json(
    {
      productCode: product.productCode,
      title: product.title ?? composedTitle(product),
      description: product.description,
      design: {
        code: product.designCode,
        name: product.designName,
        colour: product.colour,
        productType: product.productType,
        motif: product.motif,
        motifCategory: product.motifCategory,
      },
      qty: product.qty,
      images: images.map((i) => ({
        slot: i.slot,
        url: publicUrl(i.storageKey as string),
        width: i.width,
        height: i.height,
        // Null alt composes downstream rather than shipping an empty string.
        alt: i.alt ?? `${composedTitle(product)}, ${i.slot ?? "detail"}`,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

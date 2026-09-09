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
 * It also needs everything SLK knows about the design — fibre, weave, craft,
 * audience, the pallu and border and blouse — because a prompt that says
 * "a cotton saree" should say so because the record says Cotton, not because
 * somebody typed it. The first version of this returned four attributes out
 * of forty; this returns them all.
 *
 * Gated by `TANTU_READ_SECRET`, not by `ADMIN_TASK_SECRET`, and the distinction
 * is the point: that one also opens publish-one, which writes listings to a
 * live storefront. This caller only needs to read, so it gets a credential
 * that can only do that. If Tantu is ever compromised, the blast radius is a
 * product lookup rather than a Shopify publish.
 *
 * Machine to machine, not a signed-in session — deliberately unreachable by
 * floor/office/owner cookies. Read-only: it writes nothing and takes no action.
 */

interface ProductRow extends Record<string, unknown> {
  productCode: string;
  colourwayId: string;
  title: string | null;
  description: string | null;
  designCode: string;
  designName: string;
  qty: number;
  /** Every column on the design row, ids included. Resolved below. */
  design: Record<string, unknown>;
  colourId: string | null;
  secondaryColourId: string | null;
}

interface LabelRow extends Record<string, unknown> {
  id: string;
  label: string;
}

interface ImageRow extends Record<string, unknown> {
  slot: string | null;
  storageKey: string | null;
  width: number | null;
  height: number | null;
  alt: string | null;
}

/** `product_type_id` → `productType`. */
function attributeName(column: string): string {
  return column
    .replace(/_id$/, "")
    .replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Every design attribute, by name, as the word a person would use.
 *
 * Generic on purpose. SLK's own screens join each lookup by hand, and a
 * design carries some forty of them; a hand-written list here would be forty
 * lines that silently go stale the day one is added. Instead: take every
 * `*_id` column on the row, resolve the lot in one query, and hand back
 * whatever is there. A new attribute in SLK appears here without a deploy.
 */
async function resolveAttributes(
  design: Record<string, unknown>,
  colourId: string | null,
  secondaryColourId: string | null,
): Promise<Record<string, string | null>> {
  const idColumns = Object.entries(design).filter(
    ([column, value]) =>
      column.endsWith("_id") && typeof value === "string" && column !== "descriptor_id",
  ) as [string, string][];

  const wanted = new Set(idColumns.map(([, id]) => id));
  if (colourId) wanted.add(colourId);
  if (secondaryColourId) wanted.add(secondaryColourId);

  const labels = new Map<string, string>();
  if (wanted.size > 0) {
    const rows = await db.execute<LabelRow>(sql`
      select id, label from lookup_value where id = any(${[...wanted]}::uuid[])
    `);
    for (const row of rows) labels.set(row.id, row.label);
  }

  const out: Record<string, string | null> = {};
  for (const [column, id] of idColumns) {
    out[attributeName(column)] = labels.get(id) ?? null;
  }
  out.colour = colourId ? (labels.get(colourId) ?? null) : null;
  out.secondaryColour = secondaryColourId ? (labels.get(secondaryColourId) ?? null) : null;

  // A record written before Textile Material existed still says what its
  // cloth is, in the column it said it in. Same fallback SLK's own grid uses.
  out.textileMaterial =
    out.textileMaterial ??
    out.silkSubFamily ??
    out.cottonSubFamily ??
    out.fabricType ??
    out.regionalStyle ??
    null;

  return out;
}

/**
 * What the storefront would say when nobody has written anything.
 *
 * Not the Shopify composition, which needs a channel and a price band this
 * caller has neither of — just enough for a person to recognise the product
 * they typed a code for.
 */
function composedTitle(colour: string | null, name: string, type: string | null): string {
  // The design name usually already ends in the product type — "Kalamkari
  // Cotton Saree" — so appending it again reads "… Saree Saree".
  const needsType = type !== null && !name.toLowerCase().endsWith(type.toLowerCase());
  return [colour, name, needsType ? type : null].filter(Boolean).join(" ");
}

export async function GET(request: Request): Promise<Response> {
  const secret = process.env["TANTU_READ_SECRET"];
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
      b.code                  as "productCode",
      cw.id                   as "colourwayId",
      b.title,
      b.description,
      d.code                  as "designCode",
      d.name                  as "designName",
      b.qty,
      row_to_json(d)          as design,
      cw.colour_id            as "colourId",
      cw.secondary_colour_id  as "secondaryColourId"
    from batch b
    join colourway cw on cw.id = b.colourway_id
    join design d     on d.id  = cw.design_id
    where b.code = ${code}
    limit 1
  `);

  const product = rows[0];
  if (product === undefined) {
    return Response.json({ error: `No product carries the code ${code}.` }, { status: 404 });
  }

  const [attributes, images] = await Promise.all([
    resolveAttributes(product.design, product.colourId, product.secondaryColourId),
    db.execute<ImageRow>(sql`
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
    `),
  ]);

  const title =
    product.title ??
    composedTitle(attributes.colour ?? null, product.designName, attributes.productType ?? null);

  return Response.json(
    {
      productCode: product.productCode,
      title,
      description: product.description,
      design: {
        code: product.designCode,
        name: product.designName,
        ...attributes,
      },
      qty: product.qty,
      images: images.map((i) => ({
        slot: i.slot,
        url: publicUrl(i.storageKey as string),
        width: i.width,
        height: i.height,
        // Null alt composes downstream rather than shipping an empty string.
        alt: i.alt ?? `${title}, ${i.slot ?? "detail"}`,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

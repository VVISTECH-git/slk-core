import { sql } from "drizzle-orm";
import QRCode from "qrcode";

import { db } from "@/lib/db";

/**
 * Stock, one physical piece at a time.
 *
 * Product Management answers "what do we sell and how much is there"; this
 * answers "which saree is this". They are different questions and the second
 * one is asked with a scanner in hand, so it gets its own screen rather than
 * a tab on the first.
 */
export interface PieceRow {
  id: string;
  /** 500001 and up. On the label stuck to this saree. */
  itemCode: string;
  /** 300001 and up. Shared with every piece in the same consignment. */
  productCode: string | null;
  serial: number;
  designCode: string;
  name: string;
  colour: string | null;
  productType: string | null;
  motifCategory: string | null;
  motif: string | null;
  location: string | null;
  /** "01 Sep 2026" — what the table shows. */
  receivedAt: string | null;
  /**
   * The same date as "2026-09-01", which is what the table sorts by.
   *
   * Sorting the readable one puts the 1st of every month together, because
   * text does not know that "01 Sep" comes after "31 Aug".
   */
  receivedOn: string | null;
  reference: string | null;
  priceMinor: number | null;
  /** Data URIs, generated server-side so the browser renders an image. */
  itemQr: string;
  productQr: string | null;
}

/**
 * A QR code as an SVG data URI.
 *
 * Generated on the server: the alternative is shipping an encoder to the
 * browser and drawing a few hundred canvases, and these are static — a code
 * printed on cloth never changes.
 *
 * SVG rather than PNG because these get printed, and a label printer should
 * be given something that scales rather than a bitmap to interpolate.
 * Correction level M tolerates a fair amount of damage, which matters for a
 * sticker that spends its life on a folded saree.
 */
async function qr(text: string): Promise<string> {
  const svg = await QRCode.toString(text, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 0,
    width: 96,
  });

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export async function loadPieces(): Promise<PieceRow[]> {
  const rows = await db.execute<Omit<PieceRow, "itemQr" | "productQr">>(sql`
    select
      p.id,
      p.code                                    as "itemCode",
      b.code                                    as "productCode",
      p.serial,
      d.code                                    as "designCode",
      d.name,
      colour.label                              as colour,
      product_type.label                        as "productType",
      motif_cat.label                           as "motifCategory",
      motif.label                               as motif,
      l.name                                    as location,
      to_char(b.received_at, 'DD Mon YYYY')     as "receivedAt",
      to_char(b.received_at, 'YYYY-MM-DD')      as "receivedOn",
      b.reference,
      cw.retail_minor                           as "priceMinor"
    from piece p
    join colourway cw on cw.id = p.colourway_id
    join design d     on d.id  = cw.design_id
    left join batch b            on b.id = p.batch_id
    left join location l         on l.id = b.location_id
    left join lookup_value colour       on colour.id = cw.colour_id
    left join lookup_value product_type on product_type.id = d.product_type_id
    left join lookup_value motif_cat    on motif_cat.id = d.motif_category_id
    left join lookup_value motif        on motif.id = d.motif_id
    order by p.code desc
  `);

  // In parallel, because each is a few milliseconds of encoding and a page of
  // fifty pieces would otherwise spend a noticeable moment doing them in turn.
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      itemQr: await qr(row.itemCode),
      productQr: row.productCode === null ? null : await qr(row.productCode),
    })),
  );
}

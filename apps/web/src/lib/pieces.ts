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
  /**
   * Where it is now, from the ledger — null once it has left us.
   *
   * Not where it arrived. That is what this used to be, and it meant a saree
   * that had been sold six weeks ago still read as sitting in the warehouse,
   * on a screen whose whole job is answering "is this one here".
   */
  location: string | null;
  /** False once the ledger says it has been sold, written off or sent on. */
  isHeld: boolean;
  /** The consignment's location — where it came in, which never changes. */
  receivedInto: string | null;
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

/**
 * One piece, by the code on its label.
 *
 * The scanner's question, and a different one from `loadPieces`: that builds
 * the whole table and encodes a QR for every row, which is right for a screen
 * that prints labels and ruinous for answering "which saree is this" fifty
 * times an hour on a phone. No QR here — the phone reads codes, it does not
 * print them.
 *
 * Accepts an item code (500001, one saree) or a product code (300001, the
 * consignment). Both are on labels a person might point a camera at, and
 * refusing the wrong one because it named a delivery rather than a piece
 * would be a strange thing to explain while holding it.
 */
export async function findPieces(code: string): Promise<
  Omit<PieceRow, "itemQr" | "productQr">[]
> {
  return db.execute<Omit<PieceRow, "itemQr" | "productQr">>(sql`
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
      here.name                                 as location,
      coalesce(pos.is_held, false)              as "isHeld",
      arrived.name                              as "receivedInto",
      to_char(b.received_at, 'DD Mon YYYY')     as "receivedAt",
      to_char(b.received_at, 'YYYY-MM-DD')      as "receivedOn",
      b.reference,
      cw.retail_minor::double precision         as "priceMinor"
    from piece p
    join colourway cw on cw.id = p.colourway_id
    join design d     on d.id  = cw.design_id
    left join batch b            on b.id = p.batch_id
    left join piece_position pos on pos.piece_id = p.id
    left join location here      on here.id = pos.location_id
    left join location arrived   on arrived.id = b.location_id
    left join lookup_value colour       on colour.id = cw.colour_id
    left join lookup_value product_type on product_type.id = d.product_type_id
    left join lookup_value motif_cat    on motif_cat.id = d.motif_category_id
    left join lookup_value motif        on motif.id = d.motif_id
    where p.code = ${code} or b.code = ${code}
    order by p.serial
  `);
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
      here.name                                 as location,
      coalesce(pos.is_held, false)              as "isHeld",
      arrived.name                              as "receivedInto",
      to_char(b.received_at, 'DD Mon YYYY')     as "receivedAt",
      to_char(b.received_at, 'YYYY-MM-DD')      as "receivedOn",
      b.reference,
      -- Cast, or bigint arrives as a string through db.execute and the type
      -- above is a lie. Same as loadRecords and loadRecord.
      cw.retail_minor::double precision         as "priceMinor"
    from piece p
    join colourway cw on cw.id = p.colourway_id
    join design d     on d.id  = cw.design_id
    left join batch b            on b.id = p.batch_id
    -- Where it is now, and where it came in. The first is the ledger's
    -- answer and moves; the second is the consignment's and does not.
    left join piece_position pos on pos.piece_id = p.id
    left join location here      on here.id = pos.location_id
    left join location arrived   on arrived.id = b.location_id
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

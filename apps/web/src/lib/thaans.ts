import { sql } from "drizzle-orm";
import QRCode from "qrcode";

import { db } from "@/lib/db";

/**
 * Thaans — what a bale becomes once it's cut. See
 * `packages/db/src/schema/production.ts` for why this isn't called `piece`.
 */
export type ThaanRow = {
  id: string;
  code: string | null;
  baleId: string;
  baleCode: string;
  supplierName: string;
  itemName: string;
  qrGeneratedAt: string | null;
  createdAt: string;
};

export async function loadThaans(): Promise<ThaanRow[]> {
  return db.execute<ThaanRow>(sql`
    select
      t.id,
      t.code,
      t.bale_id                                              as "baleId",
      b.code                                                 as "baleCode",
      s.name                                                  as "supplierName",
      i.name                                                  as "itemName",
      to_char(t.qr_generated_at, 'DD Mon YYYY, HH12:MI AM')  as "qrGeneratedAt",
      to_char(t.created_at, 'DD Mon YYYY')                   as "createdAt"
    from thaan t
    join bale b on b.id = t.bale_id
    join supplier s on s.id = b.supplier_id
    join cloth_item i on i.id = b.item_id
    order by t.created_at desc, t.code
  `);
}

/**
 * A QR code as an SVG data URI, generated server-side — same reasoning as
 * the catalogue's own `qr()` in `lib/pieces.ts`: these get printed, and a
 * printer should be given something that scales rather than a bitmap.
 */
async function qr(text: string): Promise<string> {
  const svg = await QRCode.toString(text, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 0,
    width: 160,
  });

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export interface ThaanPrintRow {
  id: string;
  code: string;
  qr: string;
}

export interface ThaanPrintBatch {
  baleCode: string;
  rows: ThaanPrintRow[];
}

/** The Thaans from one bale that already have a code — what "Print QR codes" hands to the printer. */
export async function loadThaanPrintBatch(baleId: string): Promise<ThaanPrintBatch> {
  const [bale] = await db.execute<{ code: string }>(sql`
    select code from bale where id = ${baleId}
  `);

  const thaans = await db.execute<{ id: string; code: string }>(sql`
    select id, code from thaan
    where bale_id = ${baleId} and code is not null
    order by code
  `);

  const rows = await Promise.all(
    thaans.map(async (t) => ({ id: t.id, code: t.code, qr: await qr(t.code) })),
  );

  return { baleCode: bale?.code ?? "", rows };
}

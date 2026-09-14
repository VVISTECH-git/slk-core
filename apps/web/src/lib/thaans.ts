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
  /** Cascaded from the bale — the same "Sarees, Fabric, Chunnies..." set. */
  baleType: string;
  billEntryDate: string;
  /** Metres received ÷ Thaans cut from that bale — this Thaan's own share. */
  perThaanMetres: number | null;
  qrGeneratedAt: string | null;
  qrGeneratedByName: string | null;
  createdAt: string;
  voidedAt: string | null;
  voidedByName: string | null;
  /**
   * Where this Thaan actually is right now, in plain terms: no code yet
   * ("QR Pending"), coded but not yet sent for stitching — shouldn't really
   * persist, since QR generation sends it automatically, but can happen if
   * no vendor does Label Stitching yet ("QR Generated"), out with whoever
   * stitches labels ("Label Pending"), or back and done ("Labelled").
   */
  stitchStatus: "QR Pending" | "QR Generated" | "Label Pending" | "Labelled";
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
      b.type                                                  as "baleType",
      to_char(b.bill_entry_date, 'DD Mon YYYY')              as "billEntryDate",
      round(b.metres_received / count(*) over (partition by t.bale_id), 2)::double precision
                                                               as "perThaanMetres",
      to_char(t.qr_generated_at, 'DD Mon YYYY, HH12:MI AM')  as "qrGeneratedAt",
      qr_by.name                                              as "qrGeneratedByName",
      to_char(t.created_at, 'DD Mon YYYY')                   as "createdAt",
      to_char(t.voided_at, 'DD Mon YYYY, HH12:MI AM')        as "voidedAt",
      void_by.name                                            as "voidedByName",
      case
        when t.code is null then 'QR Pending'
        when lh.thaan_id is null then 'QR Generated'
        when lh.received_at is null then 'Label Pending'
        else 'Labelled'
      end                                                      as "stitchStatus"
    from thaan t
    join bale b on b.id = t.bale_id
    join supplier s on s.id = b.supplier_id
    join cloth_item i on i.id = b.item_id
    left join actor qr_by on qr_by.id = t.qr_generated_by_id
    left join actor void_by on void_by.id = t.voided_by_id
    left join handover lh on lh.thaan_id = t.id and lh.stage = 'Label Stitching'
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

/**
 * The Thaans from one bale that already have a code — what "Print QR codes"
 * hands to the printer. `onlyThaanId` narrows it to a single reprint, from
 * a Thaan row's own "Print QR code" action.
 */
export async function loadThaanPrintBatch(baleId: string, onlyThaanId?: string): Promise<ThaanPrintBatch> {
  const [bale] = await db.execute<{ code: string }>(sql`
    select code from bale where id = ${baleId}
  `);

  const thaans = await db.execute<{ id: string; code: string }>(
    onlyThaanId === undefined
      ? sql`
          select id, code from thaan
          where bale_id = ${baleId} and code is not null
          order by code
        `
      : sql`
          select id, code from thaan
          where bale_id = ${baleId} and code is not null and id = ${onlyThaanId}
          order by code
        `,
  );

  const rows = await Promise.all(
    thaans.map(async (t) => ({ id: t.id, code: t.code, qr: await qr(t.code) })),
  );

  return { baleCode: bale?.code ?? "", rows };
}

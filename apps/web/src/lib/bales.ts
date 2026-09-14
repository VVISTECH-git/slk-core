import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

/**
 * Kora to Shelf, step one: receiving a bale.
 *
 * Deliberately reads and writes the `bale` and `supplier` tables only — no
 * join to `design`, `colourway` or `piece`. See
 * `packages/db/src/schema/production.ts` for why.
 */
export type BaleRow = {
  id: string;
  code: string;
  supplierId: string;
  supplierName: string;
  transporter: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  type: string;
  metresReceived: number;
  uom: "Mtrs" | "Nos";
  itemId: string;
  itemName: string;
  baleCount: number;
  notes: string | null;
  status: "awaiting_cutting" | "cut" | "returned";
  /** "14 Sep 2026" — when this bale was entered, not when the invoice was prepared. */
  billEntryDate: string;
  /** "2026-09-14" — for sorting; "DD Mon YYYY" doesn't sort chronologically as text. */
  billEntryDateOn: string;
  recordedByName: string | null;
  /** How many Thaans this bale was cut into. Zero while it's still awaiting cutting. */
  thaanCount: number;
  /** Of those, how many already have a QR code. Never more than `thaanCount`. */
  qrGeneratedCount: number;
  /** Metres received ÷ Thaans — the spreadsheet's own "Per Thaan Mtr". Null until cut. */
  perThaanMetres: number | null;
};

export async function loadBales(): Promise<BaleRow[]> {
  return db.execute<BaleRow>(sql`
    select
      b.id,
      b.code,
      b.supplier_id                                 as "supplierId",
      s.name                                         as "supplierName",
      b.transporter,
      b.invoice_number                              as "invoiceNumber",
      to_char(b.invoice_date, 'YYYY-MM-DD')         as "invoiceDate",
      b.type,
      b.metres_received::double precision           as "metresReceived",
      b.uom,
      b.item_id                                     as "itemId",
      i.name                                         as "itemName",
      b.bale_count                                  as "baleCount",
      b.notes,
      b.status,
      to_char(b.bill_entry_date, 'DD Mon YYYY')     as "billEntryDate",
      to_char(b.bill_entry_date, 'YYYY-MM-DD')      as "billEntryDateOn",
      a.name                                         as "recordedByName",
      coalesce(t.thaan_count, 0)                    as "thaanCount",
      coalesce(t.qr_count, 0)                       as "qrGeneratedCount",
      case when coalesce(t.thaan_count, 0) > 0
        then round(b.metres_received / t.thaan_count, 2)
        else null
      end::double precision                          as "perThaanMetres"
    from bale b
    join supplier s on s.id = b.supplier_id
    join cloth_item i on i.id = b.item_id
    left join actor a on a.id = b.recorded_by_id
    left join (
      select
        bale_id,
        count(*)::int              as thaan_count,
        count(qr_generated_at)::int as qr_count
      from thaan
      group by bale_id
    ) t on t.bale_id = b.id
    order by b.bill_entry_date desc, b.code desc
  `);
}

export type SupplierRow = {
  id: string;
  name: string;
  codePrefix: string;
  phone: string | null;
  gstin: string | null;
  address: string | null;
  contactPerson: string | null;
  baleCount: number;
};

export async function loadSuppliers(): Promise<SupplierRow[]> {
  return db.execute<SupplierRow>(sql`
    select
      s.id,
      s.name,
      s.code_prefix                        as "codePrefix",
      s.phone,
      s.gstin,
      s.address,
      s.contact_person                     as "contactPerson",
      count(b.id)::int                     as "baleCount"
    from supplier s
    left join bale b on b.supplier_id = s.id
    group by s.id
    order by s.name
  `);
}

export type ClothItemRow = {
  id: string;
  name: string;
  baleCount: number;
};

export async function loadClothItems(): Promise<ClothItemRow[]> {
  return db.execute<ClothItemRow>(sql`
    select
      i.id,
      i.name,
      count(b.id)::int                     as "baleCount"
    from cloth_item i
    left join bale b on b.item_id = i.id
    group by i.id
    order by i.name
  `);
}

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
  /** "21 May 2026" — the same date, formatted for display. Null when `invoiceDate` is. */
  invoiceDateDisplay: string | null;
  invoiceAmount: number | null;
  type: string;
  metresReceived: number;
  uom: "Mtrs" | "Nos";
  itemId: string;
  itemName: string;
  baleCount: number;
  /** SLK's own premium-ness mark for this batch — "A3", "G5"... Not from the supplier, not tied to the item. */
  gradeCode: string | null;
  notes: string | null;
  /** Whether Thaans from this bale go through Second Print at all — see `stagesFor`. */
  needsSecondPrint: boolean;
  status: "awaiting_cutting" | "cutting_in_progress" | "cut" | "returned";
  /** "14 Sep 2026" — when this bale was entered, not when the invoice was prepared. */
  billEntryDate: string;
  /** "2026-09-14" — for sorting; "DD Mon YYYY" doesn't sort chronologically as text. */
  billEntryDateOn: string;
  recordedByName: string | null;
  /** Who initiated cutting. Null while the bale is still awaiting it. */
  cutByName: string | null;
  /** Who marked it returned. Null unless the bale is `returned`. */
  returnedByName: string | null;
  /** Who ran "Generate QR codes". Null until at least one Thaan has a code. */
  qrGeneratedByName: string | null;
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
      to_char(b.invoice_date, 'DD Mon YYYY')        as "invoiceDateDisplay",
      b.invoice_amount::double precision            as "invoiceAmount",
      b.type,
      b.metres_received::double precision           as "metresReceived",
      b.uom,
      b.item_id                                     as "itemId",
      i.name                                         as "itemName",
      b.bale_count                                  as "baleCount",
      b.grade_code                                  as "gradeCode",
      b.notes,
      b.needs_second_print                          as "needsSecondPrint",
      b.status,
      to_char(b.bill_entry_date, 'DD Mon YYYY')     as "billEntryDate",
      to_char(b.bill_entry_date, 'YYYY-MM-DD')      as "billEntryDateOn",
      a.name                                         as "recordedByName",
      cut_by.name                                    as "cutByName",
      returned_by.name                               as "returnedByName",
      t.qr_generated_by_name                         as "qrGeneratedByName",
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
    left join actor cut_by on cut_by.id = b.cut_by_id
    left join actor returned_by on returned_by.id = b.returned_by_id
    left join (
      select
        th.bale_id,
        count(*) filter (where th.voided_at is null)::int       as thaan_count,
        count(th.qr_generated_at) filter (where th.voided_at is null)::int as qr_count,
        max(qr_by.name)                       as qr_generated_by_name
      from thaan th
      left join actor qr_by on qr_by.id = th.qr_generated_by_id
      group by th.bale_id
    ) t on t.bale_id = b.id
    order by b.bill_entry_date desc, b.code desc
  `);
}

export type BaleCuttingEventRow = {
  id: string;
  count: number;
  recordedAt: string;
  actorName: string | null;
};

/**
 * Every `recordThaans` call against one bale, oldest first — unlike
 * `bale.cut_by_id`/`updated_at`, which only ever hold the most recent one.
 * See `bale_cutting_event` in `packages/db/src/schema/production.ts`.
 */
export async function loadBaleCuttingHistory(baleId: string): Promise<BaleCuttingEventRow[]> {
  return db.execute<BaleCuttingEventRow>(sql`
    select
      e.id,
      e.count,
      to_char(e.recorded_at, 'DD Mon YYYY, HH12:MI AM') as "recordedAt",
      a.name as "actorName"
    from bale_cutting_event e
    left join actor a on a.id = e.actor_id
    where e.bale_id = ${baleId}
    order by e.recorded_at
  `);
}

export type SupplierRow = {
  id: string;
  code: string;
  name: string;
  codePrefix: string;
  phone: string | null;
  gstin: string | null;
  address: string | null;
  contactPerson: string | null;
  status: "active" | "inactive";
  baleCount: number;
};

export async function loadSuppliers(): Promise<SupplierRow[]> {
  return db.execute<SupplierRow>(sql`
    select
      s.id,
      s.code,
      s.name,
      s.code_prefix                        as "codePrefix",
      s.phone,
      s.gstin,
      s.address,
      s.contact_person                     as "contactPerson",
      s.status,
      count(b.id)::int                     as "baleCount"
    from supplier s
    left join bale b on b.supplier_id = s.id
    group by s.id
    order by (s.status = 'active') desc, s.name
  `);
}

export type ClothItemRow = {
  id: string;
  code: string;
  name: string;
  clothTypes: string[];
  hasBlouse: boolean | null;
  border: string | null;
  pallu: string | null;
  fibreTypeId: string | null;
  fibreTypeLabel: string | null;
  status: "active" | "inactive";
  baleCount: number;
};

export async function loadClothItems(): Promise<ClothItemRow[]> {
  return db.execute<ClothItemRow>(sql`
    select
      i.id,
      i.code,
      i.name,
      i.cloth_types                        as "clothTypes",
      i.has_blouse                         as "hasBlouse",
      i.border,
      i.pallu,
      i.fibre_type_id                      as "fibreTypeId",
      fibre.label                          as "fibreTypeLabel",
      i.status,
      count(b.id)::int                     as "baleCount"
    from cloth_item i
    left join bale b on b.item_id = i.id
    left join lookup_value fibre on fibre.id = i.fibre_type_id
    group by i.id, fibre.label
    order by (i.status = 'active') desc, i.name
  `);
}

export type FibreTypeOption = { id: string; label: string };

/** Product Management's own "Fibre Type" list — reused rather than duplicated. */
export async function loadFibreTypes(): Promise<FibreTypeOption[]> {
  return db.execute<FibreTypeOption>(sql`
    select lv.id, lv.label
    from lookup_value lv
    join lookup_list ll on ll.id = lv.list_id
    where ll.code = 'fibre_type' and lv.status = 'active' and ll.is_enabled = true
    order by lv.label
  `);
}

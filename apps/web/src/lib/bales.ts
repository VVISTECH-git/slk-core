import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

/**
 * Kora to Shelf, step one: receiving a bale.
 *
 * Deliberately reads and writes the `bale` table only — no join to `design`,
 * `colourway` or `piece`. See `packages/db/src/schema/production.ts` for why.
 */
export type BaleRow = {
  id: string;
  code: string;
  supplierName: string;
  transporter: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  metresReceived: number;
  itemDescription: string | null;
  baleCount: number;
  status: "awaiting_cutting" | "cut";
  receivedAt: string;
  recordedByName: string | null;
};

export async function loadBales(): Promise<BaleRow[]> {
  return db.execute<BaleRow>(sql`
    select
      b.id,
      b.code,
      b.supplier_name                              as "supplierName",
      b.transporter,
      b.invoice_number                              as "invoiceNumber",
      to_char(b.invoice_date, 'YYYY-MM-DD')         as "invoiceDate",
      b.metres_received::double precision           as "metresReceived",
      b.item_description                            as "itemDescription",
      b.bale_count                                  as "baleCount",
      b.status,
      to_char(b.received_at, 'DD Mon YYYY')         as "receivedAt",
      a.name                                         as "recordedByName"
    from bale b
    left join actor a on a.id = b.recorded_by_id
    order by b.received_at desc, b.code desc
  `);
}

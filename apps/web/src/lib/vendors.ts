import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

/**
 * Who does a stage of processing — cutting, salava, karakkaya, printing,
 * ironing. Its own file rather than `lib/bales.ts`: nothing in `bale` points
 * at a vendor yet, so this isn't bale data.
 */
export type VendorRow = {
  id: string;
  name: string;
  phone: string | null;
  village: string | null;
  stages: string[];
  notes: string | null;
  /** "The Master" — who freshly QR-coded Thaans are automatically sent to for Label Stitching. At most one vendor. */
  isLabelMaster: boolean;
  /** What this vendor charges per piece, by stage — only stages with a rate set. */
  rates: { stage: string; unitPrice: number }[];
  /** Everything billed to this vendor via `vendor_transaction`, ever. */
  totalEarned: number;
  /** Everything actually paid, via `vendor_payment`. */
  totalPaid: number;
  /** `totalEarned - totalPaid`. What's still owed, if positive. */
  balanceDue: number;
};

export async function loadVendors(): Promise<VendorRow[]> {
  const rows = await db.execute<Omit<VendorRow, "balanceDue">>(sql`
    select
      v.id, v.name, v.phone, v.village, v.stages, v.notes,
      v.is_label_master as "isLabelMaster",
      coalesce(
        (select json_agg(json_build_object('stage', vr.stage, 'unitPrice', vr.unit_price::double precision) order by vr.stage)
         from vendor_rate vr where vr.vendor_id = v.id),
        '[]'::json
      ) as "rates",
      coalesce((select sum(vt.amount) from vendor_transaction vt where vt.vendor_id = v.id), 0)::double precision as "totalEarned",
      coalesce((select sum(vp.amount) from vendor_payment vp where vp.vendor_id = v.id), 0)::double precision as "totalPaid"
    from vendor v
    order by v.name
  `);

  return rows.map((r) => ({ ...r, balanceDue: r.totalEarned - r.totalPaid }));
}

export type VendorLedgerEntry = {
  kind: "transaction" | "payment";
  id: string;
  date: string;
  /** The stage, for a transaction; null for a payment. */
  stage: string | null;
  /** Piece count, for a transaction; null for a payment. */
  pieceCount: number | null;
  amount: number;
  notes: string | null;
};

/** One vendor's recent billing history — transactions and payments, newest first. */
export async function loadVendorLedger(vendorId: string): Promise<VendorLedgerEntry[]> {
  const rows = await db.execute<VendorLedgerEntry & { sortAt: string }>(sql`
    (
      select
        'transaction' as "kind",
        id,
        to_char(transaction_date, 'DD Mon YYYY') as "date",
        stage,
        piece_count as "pieceCount",
        amount::double precision as "amount",
        notes,
        created_at as "sortAt"
      from vendor_transaction
      where vendor_id = ${vendorId}
    )
    union all
    (
      select
        'payment' as "kind",
        id,
        to_char(paid_on, 'DD Mon YYYY') as "date",
        null as "stage",
        null as "pieceCount",
        amount::double precision as "amount",
        notes,
        created_at as "sortAt"
      from vendor_payment
      where vendor_id = ${vendorId}
    )
    order by "sortAt" desc
  `);

  return rows.map(({ sortAt: _sortAt, ...entry }) => entry);
}

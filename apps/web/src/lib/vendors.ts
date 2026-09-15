import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

/**
 * Who does a stage of processing — cutting, salava, karakkaya, printing,
 * ironing. Its own file rather than `lib/bales.ts`: nothing in `bale` points
 * at a vendor yet, so this isn't bale data.
 */
export type VendorRow = {
  id: string;
  code: string;
  name: string;
  primaryPhone: string | null;
  secondaryPhone: string | null;
  village: string | null;
  stages: string[];
  notes: string | null;
  /** What this vendor charges per piece, by stage — only stages with a rate set. */
  rates: { stage: string; unitPrice: number }[];
  /** Everything billed to this vendor via `vendor_transaction`, ever. */
  totalEarned: number;
  /** Everything actually paid, via `vendor_payment`. */
  totalPaid: number;
  /** `totalEarned - totalPaid`. What's still owed, if positive. */
  balanceDue: number;
  /** Thaans sent to this vendor with no `received_at` yet — out with them right now. */
  currentlyHolding: number;
  /** `currentlyHolding`, split by stage — only stages with at least one. */
  holdingByStage: { stage: string; count: number }[];
};

export type VendorSummary = {
  id: string;
  code: string;
  name: string;
  stages: string[];
};

/**
 * Just enough to fill a "who's this going to" picker — the Send screen on
 * both web and mobile. Deliberately not `loadVendors`: that carries billing
 * totals, which floor-level actors sending a batch have no reason to read.
 */
export async function loadVendorSummaries(): Promise<VendorSummary[]> {
  return db.execute<VendorSummary>(sql`
    select id, code, name, stages from vendor order by name
  `);
}

export async function loadVendors(): Promise<VendorRow[]> {
  const rows = await db.execute<Omit<VendorRow, "balanceDue">>(sql`
    select
      v.id, v.code, v.name,
      v.primary_phone as "primaryPhone", v.secondary_phone as "secondaryPhone",
      v.village, v.stages, v.notes,
      coalesce(
        (select json_agg(json_build_object('stage', vr.stage, 'unitPrice', vr.unit_price::double precision) order by vr.stage)
         from vendor_rate vr where vr.vendor_id = v.id),
        '[]'::json
      ) as "rates",
      coalesce((select sum(vt.amount) from vendor_transaction vt where vt.vendor_id = v.id), 0)::double precision as "totalEarned",
      coalesce((select sum(vp.amount) from vendor_payment vp where vp.vendor_id = v.id), 0)::double precision as "totalPaid",
      coalesce(
        (select count(*) from handover h where h.vendor_id = v.id and h.received_at is null),
        0
      )::int as "currentlyHolding",
      coalesce(
        (select json_agg(json_build_object('stage', x.stage, 'count', x.n) order by x.stage)
         from (
           select stage, count(*)::int as n
           from handover
           where vendor_id = v.id and received_at is null
           group by stage
         ) x),
        '[]'::json
      ) as "holdingByStage"
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
  /**
   * Which bale(s) the Thaans behind a transaction actually came from —
   * more than one when a receive batch happened to group Thaans from
   * different bales under the same vendor and stage. Null for a payment.
   */
  baleCodes: string[] | null;
  /** Finance's sign-off; null while still awaiting review. Null for a payment. */
  approvedAt: string | null;
  /** When this transaction's amount was folded into a payment. Null for a payment row itself. */
  paidAt: string | null;
};

export type { VendorTransactionStatus } from "./vendor-status";
export { vendorTransactionStatus } from "./vendor-status";

const BALE_CODES_SUBQUERY = sql`
  (
    select array_agg(distinct b.code order by b.code)
    from handover h
    join thaan t on t.id = h.thaan_id
    join bale b on b.id = t.bale_id
    where h.vendor_transaction_id = vendor_transaction.id
  )
`;

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
        ${BALE_CODES_SUBQUERY} as "baleCodes",
        to_char(approved_at, 'DD Mon YYYY, HH12:MI AM') as "approvedAt",
        to_char(paid_at, 'DD Mon YYYY, HH12:MI AM') as "paidAt",
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
        null as "baleCodes",
        null as "approvedAt",
        null as "paidAt",
        created_at as "sortAt"
      from vendor_payment
      where vendor_id = ${vendorId}
    )
    order by "sortAt" desc
  `);

  return rows.map(({ sortAt: _sortAt, ...entry }) => entry);
}

export type LedgerEntryRow = VendorLedgerEntry & {
  vendorId: string;
  vendorName: string;
};

/** One transaction's Thaans — the drill-down behind its piece count. */
export type VendorTransactionThaan = {
  baleCode: string;
  thaanCode: string | null;
};

export async function loadVendorTransactionThaans(transactionId: string): Promise<VendorTransactionThaan[]> {
  return db.execute<VendorTransactionThaan>(sql`
    select b.code as "baleCode", t.code as "thaanCode"
    from handover h
    join thaan t on t.id = h.thaan_id
    join bale b on b.id = t.bale_id
    where h.vendor_transaction_id = ${transactionId}
    order by b.code, t.code
  `);
}

export type FinancialOverview = {
  /** Billed and paid, one row per calendar month from the first billing or
   * payment onward — zero-filled, so a quiet month is a gap in the chart
   * rather than a missing bar. */
  byMonth: { month: string; billed: number; paid: number }[];
  /** Billed total and transaction count per stage, across every vendor. */
  byStage: { stage: string; billed: number; transactions: number }[];
  /** Same figures as `loadVendors`, reshaped for a balance-due ranking. */
  byVendor: { vendorId: string; vendorName: string; billed: number; paid: number; balanceDue: number }[];
};

/**
 * The same billing and payment rows Vendor Ledger lists one at a time,
 * rolled up into trends — by month, by stage, by vendor — for a dashboard
 * rather than an audit trail.
 */
export async function loadFinancialOverview(): Promise<FinancialOverview> {
  const byMonth = await db.execute<{ month: string; billed: number; paid: number }>(sql`
    with bounds as (
      select coalesce(
        least(
          (select min(transaction_date) from vendor_transaction),
          (select min(paid_on) from vendor_payment)
        ),
        date_trunc('month', now())
      ) as start
    )
    select
      to_char(months.month, 'YYYY-MM') as "month",
      coalesce(b.billed, 0)::double precision as "billed",
      coalesce(p.paid, 0)::double precision as "paid"
    from bounds,
      generate_series(date_trunc('month', bounds.start), date_trunc('month', now()), interval '1 month') as months(month)
    left join (
      select date_trunc('month', transaction_date) as month, sum(amount) as billed
      from vendor_transaction
      group by 1
    ) b on b.month = months.month
    left join (
      select date_trunc('month', paid_on) as month, sum(amount) as paid
      from vendor_payment
      group by 1
    ) p on p.month = months.month
    order by months.month
  `);

  const byStage = await db.execute<{ stage: string; billed: number; transactions: number }>(sql`
    select stage, sum(amount)::double precision as "billed", count(*)::int as "transactions"
    from vendor_transaction
    group by stage
    order by billed desc
  `);

  const vendors = await loadVendors();
  const byVendor = vendors
    .map((v) => ({
      vendorId: v.id,
      vendorName: v.name,
      billed: v.totalEarned,
      paid: v.totalPaid,
      balanceDue: v.balanceDue,
    }))
    .sort((a, b) => b.balanceDue - a.balanceDue);

  return { byMonth, byStage, byVendor };
}

/** Every vendor's billing history together — what's owed and what's been paid, across the whole business. */
export async function loadAllVendorLedgers(): Promise<LedgerEntryRow[]> {
  const rows = await db.execute<LedgerEntryRow & { sortAt: string }>(sql`
    (
      select
        'transaction' as "kind",
        vt.id,
        to_char(vt.transaction_date, 'DD Mon YYYY') as "date",
        vt.stage,
        vt.piece_count as "pieceCount",
        vt.amount::double precision as "amount",
        vt.notes,
        (
          select array_agg(distinct b.code order by b.code)
          from handover h
          join thaan t on t.id = h.thaan_id
          join bale b on b.id = t.bale_id
          where h.vendor_transaction_id = vt.id
        ) as "baleCodes",
        to_char(vt.approved_at, 'DD Mon YYYY, HH12:MI AM') as "approvedAt",
        to_char(vt.paid_at, 'DD Mon YYYY, HH12:MI AM') as "paidAt",
        vt.vendor_id as "vendorId",
        v.name as "vendorName",
        vt.created_at as "sortAt"
      from vendor_transaction vt
      join vendor v on v.id = vt.vendor_id
    )
    union all
    (
      select
        'payment' as "kind",
        vp.id,
        to_char(vp.paid_on, 'DD Mon YYYY') as "date",
        null as "stage",
        null as "pieceCount",
        vp.amount::double precision as "amount",
        vp.notes,
        null as "baleCodes",
        null as "approvedAt",
        null as "paidAt",
        vp.vendor_id as "vendorId",
        v.name as "vendorName",
        vp.created_at as "sortAt"
      from vendor_payment vp
      join vendor v on v.id = vp.vendor_id
    )
    order by "sortAt" desc
  `);

  return rows.map(({ sortAt: _sortAt, ...entry }) => entry);
}

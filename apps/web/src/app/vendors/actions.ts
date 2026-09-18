"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { actingId, guardJobRole } from "@/lib/session";
import { STAGES } from "@/lib/stages";
import { loadDamagedThaansForVendor, type DamagedThaanRow } from "@/lib/thaan-damage";
import {
  loadVendorLedger,
  loadVendorTransactionThaans,
  type VendorLedgerEntry,
  type VendorTransactionThaan,
} from "@/lib/vendors";

/**
 * Every vendor-billing action, gated to this one job role (Admin always
 * passes too, via hasAnyJobRole).
 *
 * Not exported, unlike the pattern its own name suggests: this file is
 * `"use server"`, which only allows async function exports across a module
 * boundary — a route handler (or any other importer) pulling in so much as
 * this one plain array fails the production build outright ("A 'use
 * server' file can only export async functions, found object"), even
 * though the very same file happily exports async functions and `interface`s
 * (types are erased, so they don't count). Every other gate — the API
 * routes under api/v1/vendors, vendors/page.tsx, vendor-ledger/page.tsx,
 * the sidebar entry — repeats the literal `["Finance Manager"]` by hand
 * instead, and has to be kept in sync with this by eye.
 */
const FINANCE_JOB_ROLES = ["Finance Manager"];

export interface ActionResult {
  ok: boolean;
  message: string;
}

export interface VendorDraft {
  name: string;
  primaryPhone: string;
  secondaryPhone: string;
  village: string;
  stages: string[];
  notes: string;
}

/**
 * Drizzle's `sql` template spreads a JS array into `($1, $2, ...)` —
 * built for `IN (...)`, not for binding one array-typed parameter. Handing
 * Postgres its own array literal syntax as a single string sidesteps that;
 * the `::text[]` cast on the call site parses it back into a real array.
 */
function pgTextArrayLiteral(values: string[]): string {
  const escaped = values.map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
  return `{${escaped.join(",")}}`;
}

export async function createVendor(draft: VendorDraft): Promise<ActionResult> {
  const denied = await guardJobRole(FINANCE_JOB_ROLES);
  if (denied !== null) return denied;

  const cleanName = draft.name.trim();
  if (cleanName === "") {
    return { ok: false, message: "Name is required." };
  }

  const [clash] = await db.execute<{ name: string }>(sql`
    select name from vendor where lower(name) = lower(${cleanName})
  `);
  if (clash !== undefined) {
    return { ok: false, message: `"${clash.name}" is already on the list.` };
  }

  await db.execute(sql`
    insert into vendor (name, primary_phone, secondary_phone, village, stages, notes, code)
    values (
      ${cleanName},
      ${draft.primaryPhone.trim() || null},
      ${draft.secondaryPhone.trim() || null},
      ${draft.village.trim() || null},
      ${pgTextArrayLiteral(draft.stages)}::text[],
      ${draft.notes.trim() || null},
      'V' || nextval('vendor_code_seq')
    )
  `);

  revalidatePath("/vendors");

  return { ok: true, message: `Added ${cleanName}.` };
}

/** Fixing what was entered. The name check excludes this row itself. */
export async function updateVendor(vendorId: string, draft: VendorDraft): Promise<ActionResult> {
  const denied = await guardJobRole(FINANCE_JOB_ROLES);
  if (denied !== null) return denied;

  const cleanName = draft.name.trim();
  if (cleanName === "") {
    return { ok: false, message: "Name is required." };
  }

  const [clash] = await db.execute<{ name: string }>(sql`
    select name from vendor where lower(name) = lower(${cleanName}) and id <> ${vendorId}
  `);
  if (clash !== undefined) {
    return { ok: false, message: `"${clash.name}" is already on the list.` };
  }

  const [row] = await db.execute<{ name: string }>(sql`
    update vendor
    set
      name = ${cleanName},
      primary_phone = ${draft.primaryPhone.trim() || null},
      secondary_phone = ${draft.secondaryPhone.trim() || null},
      village = ${draft.village.trim() || null},
      stages = ${pgTextArrayLiteral(draft.stages)}::text[],
      notes = ${draft.notes.trim() || null},
      updated_at = now()
    where id = ${vendorId}
    returning name
  `);

  if (row === undefined) {
    return { ok: false, message: "That vendor no longer exists." };
  }

  revalidatePath("/vendors");

  return { ok: true, message: `${row.name} updated.` };
}

/**
 * What a vendor charges per piece for one stage. `unitPrice` of `null`
 * clears the rate rather than setting it to zero — a vendor with no rate
 * set is "not priced yet", which is a different fact than "does this stage
 * for free".
 */
export async function setVendorRate(
  vendorId: string,
  stage: string,
  unitPrice: number | null,
): Promise<ActionResult> {
  const denied = await guardJobRole(FINANCE_JOB_ROLES);
  if (denied !== null) return denied;

  if (!(STAGES as readonly string[]).includes(stage)) {
    return { ok: false, message: "Unknown stage." };
  }
  if (unitPrice !== null && (!Number.isFinite(unitPrice) || unitPrice < 0)) {
    return { ok: false, message: "Rate must be a number, zero or greater." };
  }

  if (unitPrice === null) {
    await db.execute(sql`
      delete from vendor_rate where vendor_id = ${vendorId} and stage = ${stage}
    `);
  } else {
    await db.execute(sql`
      insert into vendor_rate (vendor_id, stage, unit_price)
      values (${vendorId}, ${stage}, ${unitPrice})
      on conflict (vendor_id, stage) do update set unit_price = excluded.unit_price, updated_at = now()
    `);
  }

  revalidatePath("/vendors");

  return { ok: true, message: `${stage} rate updated.` };
}

export interface PaymentDraft {
  amount: string;
  paidOn: string;
  method: string;
  notes: string;
}

/** Money actually paid to a vendor — settled against their running balance, not one bill. */
export async function recordVendorPayment(vendorId: string, draft: PaymentDraft): Promise<ActionResult> {
  const denied = await guardJobRole(FINANCE_JOB_ROLES);
  if (denied !== null) return denied;

  const amount = Number(draft.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: "Amount must be a number greater than zero." };
  }
  if (draft.paidOn.trim() === "") {
    return { ok: false, message: "Date is required." };
  }

  const actorId = await actingId();

  const [vendor] = await db.execute<{ name: string }>(sql`select name from vendor where id = ${vendorId}`);
  if (vendor === undefined) {
    return { ok: false, message: "That vendor no longer exists." };
  }

  await db.execute(sql`
    insert into vendor_payment (vendor_id, amount, paid_on, method, notes, recorded_by_id)
    values (${vendorId}, ${amount}, ${draft.paidOn}, ${draft.method.trim() || null}, ${draft.notes.trim() || null}, ${actorId})
  `);

  revalidatePath("/vendors");

  return { ok: true, message: `Recorded ₹${amount.toLocaleString("en-IN")} paid to ${vendor.name}.` };
}

export async function getVendorLedger(vendorId: string): Promise<VendorLedgerEntry[]> {
  const denied = await guardJobRole(FINANCE_JOB_ROLES);
  if (denied !== null) return [];

  return loadVendorLedger(vendorId);
}

export async function getVendorTransactionThaans(transactionId: string): Promise<VendorTransactionThaan[]> {
  const denied = await guardJobRole(FINANCE_JOB_ROLES);
  if (denied !== null) return [];

  return loadVendorTransactionThaans(transactionId);
}

export async function getDamagedThaans(vendorId: string): Promise<DamagedThaanRow[]> {
  const denied = await guardJobRole(FINANCE_JOB_ROLES);
  if (denied !== null) return [];

  return loadDamagedThaansForVendor(vendorId);
}

/**
 * Finance's review of one damaged Thaan, during that vendor's settlement —
 * just a status and a timestamp for now. What this should actually do to
 * the vendor's owed amount (deduct the piece from its transaction, or
 * something else) is still an open question; this only records that
 * Finance looked at it, which `writeOffDamagedThaan` then requires before
 * retiring the Thaan for good.
 */
export async function addressDamagedThaan(damageId: string): Promise<ActionResult> {
  const denied = await guardJobRole(FINANCE_JOB_ROLES);
  if (denied !== null) return denied;

  const actorId = await actingId();

  const [row] = await db.execute<{ id: string }>(sql`
    update thaan_damage
    set addressed_at = now(), addressed_by_id = ${actorId}, updated_at = now()
    where id = ${damageId} and addressed_at is null
    returning id
  `);

  revalidatePath("/vendors");
  revalidatePath("/vendor-ledger");

  if (row === undefined) {
    return { ok: false, message: "Already addressed, or that flag no longer exists." };
  }

  return { ok: true, message: "Marked addressed." };
}

/** Retires an addressed damaged Thaan for good — refused until it's been addressed first. */
export async function writeOffDamagedThaan(damageId: string): Promise<ActionResult> {
  const denied = await guardJobRole(FINANCE_JOB_ROLES);
  if (denied !== null) return denied;

  const actorId = await actingId();

  const [row] = await db.execute<{ id: string; addressedAt: string | null }>(sql`
    select id, addressed_at as "addressedAt" from thaan_damage where id = ${damageId} and written_off_at is null
  `);
  if (row === undefined) {
    return { ok: false, message: "Already written off, or that flag no longer exists." };
  }
  if (row.addressedAt === null) {
    return { ok: false, message: "Address it first, before writing it off." };
  }

  await db.execute(sql`
    update thaan_damage
    set written_off_at = now(), written_off_by_id = ${actorId}, updated_at = now()
    where id = ${damageId}
  `);

  revalidatePath("/vendors");
  revalidatePath("/vendor-ledger");

  return { ok: true, message: "Written off." };
}

/** Finance's sign-off, before any of them can be paid. */
export async function approveVendorTransactions(transactionIds: string[]): Promise<ActionResult> {
  const denied = await guardJobRole(FINANCE_JOB_ROLES);
  if (denied !== null) return denied;

  if (transactionIds.length === 0) {
    return { ok: false, message: "Nothing selected." };
  }

  const actorId = await actingId();

  const rows = await db.execute<{ id: string }>(sql`
    update vendor_transaction
    set approved_at = now(), approved_by_id = ${actorId}, updated_at = now()
    where id in (${sql.join(transactionIds.map((id) => sql`${id}`), sql`, `)})
      and approved_at is null
    returning id
  `);

  revalidatePath("/vendor-ledger");
  revalidatePath("/vendors");

  if (rows.length === 0) {
    return { ok: false, message: "Already approved — nothing changed." };
  }

  return { ok: true, message: `Approved ${rows.length} transaction${rows.length === 1 ? "" : "s"}.` };
}

/**
 * Fills in the price for transactions that were created without one — work
 * received before a vendor's rate for that stage existed yet (see
 * `receiveBatch`). Requires every selected transaction to still be unpriced
 * (`amount is null`) and to share the same vendor and stage, checked here
 * rather than trusted from the client: a single per-piece rate only makes
 * sense applied to one homogeneous group of work.
 */
export async function priceVendorTransactions(transactionIds: string[], unitPrice: number): Promise<ActionResult> {
  const denied = await guardJobRole(FINANCE_JOB_ROLES);
  if (denied !== null) return denied;

  if (transactionIds.length === 0) {
    return { ok: false, message: "Nothing selected." };
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    return { ok: false, message: "Enter a valid rate." };
  }

  const result = await db.transaction(async (tx) => {
    const rows = await tx.execute<{ id: string; vendorId: string; stage: string; pieceCount: number }>(sql`
      select id, vendor_id as "vendorId", stage, piece_count as "pieceCount"
      from vendor_transaction
      where id in (${sql.join(transactionIds.map((id) => sql`${id}`), sql`, `)})
        and amount is null
      for update
    `);

    if (rows.length === 0) return { kind: "none" as const };

    const vendorId = rows[0]!.vendorId;
    const stage = rows[0]!.stage;
    if (rows.some((r) => r.vendorId !== vendorId || r.stage !== stage)) {
      return { kind: "mixed" as const };
    }

    for (const row of rows) {
      const amount = Math.round(unitPrice * row.pieceCount * 100) / 100;
      await tx.execute(sql`
        update vendor_transaction
        set unit_price = ${unitPrice}, amount = ${amount}, updated_at = now()
        where id = ${row.id}
      `);
    }

    return { kind: "priced" as const, count: rows.length };
  });

  revalidatePath("/vendor-ledger");
  revalidatePath("/vendors");

  if (result.kind === "none") {
    return { ok: false, message: "Already priced — nothing changed." };
  }
  if (result.kind === "mixed") {
    return { ok: false, message: "Select transactions for one vendor and stage at a time." };
  }
  return { ok: true, message: `Priced ${result.count} transaction${result.count === 1 ? "" : "s"}.` };
}

export interface PayTransactionsDraft {
  paidOn: string;
  method: string;
  notes: string;
}

/**
 * Settles a set of already-approved, unpaid transactions in one go — one
 * `vendor_payment` for their combined total, linked back to each so "is
 * this paid" is answerable per transaction rather than only against the
 * vendor's overall balance. All of them have to belong to the same vendor:
 * a payment is one cheque or transfer, not a cross-vendor batch.
 */
export async function payVendorTransactions(
  vendorId: string,
  transactionIds: string[],
  draft: PayTransactionsDraft,
): Promise<ActionResult> {
  const denied = await guardJobRole(FINANCE_JOB_ROLES);
  if (denied !== null) return denied;

  if (transactionIds.length === 0) {
    return { ok: false, message: "Nothing selected." };
  }
  if (draft.paidOn.trim() === "") {
    return { ok: false, message: "Date is required." };
  }

  const actorId = await actingId();

  const result = await db.transaction(async (tx) => {
    const eligible = await tx.execute<{ id: string; amount: string }>(sql`
      select id, amount from vendor_transaction
      where id in (${sql.join(transactionIds.map((id) => sql`${id}`), sql`, `)})
        and vendor_id = ${vendorId}
        and approved_at is not null
        and paid_at is null
      for update
    `);

    if (eligible.length === 0) return null;

    const total = eligible.reduce((sum, r) => sum + Number(r.amount), 0);

    const [payment] = await tx.execute<{ id: string }>(sql`
      insert into vendor_payment (vendor_id, amount, paid_on, method, notes, recorded_by_id)
      values (${vendorId}, ${total}, ${draft.paidOn}, ${draft.method.trim() || null}, ${draft.notes.trim() || null}, ${actorId})
      returning id
    `);

    await tx.execute(sql`
      update vendor_transaction
      set paid_at = now(), vendor_payment_id = ${payment.id}, updated_at = now()
      where id in (${sql.join(eligible.map((r) => sql`${r.id}`), sql`, `)})
    `);

    return { count: eligible.length, total };
  });

  revalidatePath("/vendor-ledger");
  revalidatePath("/vendors");

  if (result === null) {
    return { ok: false, message: "None of those are approved and unpaid anymore." };
  }

  return {
    ok: true,
    message: `Paid ₹${result.total.toLocaleString("en-IN")} across ${result.count} transaction${result.count === 1 ? "" : "s"}.`,
  };
}

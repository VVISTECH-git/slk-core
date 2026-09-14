"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { actingId, guard } from "@/lib/session";
import { STAGES } from "@/lib/stages";
import { loadVendorLedger, type VendorLedgerEntry } from "@/lib/vendors";

export interface ActionResult {
  ok: boolean;
  message: string;
}

export interface VendorDraft {
  name: string;
  phone: string;
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
  const denied = await guard("floor");
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
    insert into vendor (name, phone, village, stages, notes)
    values (
      ${cleanName},
      ${draft.phone.trim() || null},
      ${draft.village.trim() || null},
      ${pgTextArrayLiteral(draft.stages)}::text[],
      ${draft.notes.trim() || null}
    )
  `);

  revalidatePath("/vendors");

  return { ok: true, message: `Added ${cleanName}.` };
}

/** Fixing what was entered. The name check excludes this row itself. */
export async function updateVendor(vendorId: string, draft: VendorDraft): Promise<ActionResult> {
  const denied = await guard("floor");
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
      phone = ${draft.phone.trim() || null},
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
  const denied = await guard("office");
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
  const denied = await guard("office");
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
  const denied = await guard("office");
  if (denied !== null) return [];

  return loadVendorLedger(vendorId);
}

"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { actingId, guard } from "@/lib/session";

import { BALE_TYPES, UOMS } from "./constants";

/** What every action here answers with: did it work, and what to say. */
export interface ActionResult {
  ok: boolean;
  message: string;
}

/**
 * Every action here is an untrusted entry point — a Server Action is
 * reachable by POST whether or not the UI rendered the control — so each one
 * re-reads what it needs and re-checks the rule, the same discipline the
 * rest of the app already follows.
 *
 * A "use server" file may only value-export async functions, so the
 * BALE_TYPES/UOMS lists this validates against live in ./constants instead —
 * exporting them from here compiles but breaks at runtime (Turbopack has no
 * way to hand a client component a plain array from a server-actions
 * module).
 */

export interface BaleDraft {
  supplierId: string;
  /** When this bale is being entered — not the invoice's own date. "YYYY-MM-DD". */
  billEntryDate: string;
  transporter: string;
  invoiceNumber: string;
  invoiceDate: string;
  /** The bill's own total, in rupees. Blank until the bill arrives, same as the number and date. */
  invoiceAmount: string;
  type: string;
  metresReceived: string;
  uom: string;
  itemId: string;
  baleCount: string;
  notes: string;
}

/** Everything about a bale except who supplied it — that's fixed once the bale's code is minted. */
export type BaleEditDraft = Omit<BaleDraft, "supplierId">;

function revalidate() {
  revalidatePath("/bales");
  revalidatePath("/suppliers");
}

interface ParsedBaleFields {
  type: string;
  metresReceived: number;
  uom: string;
  itemId: string;
  baleCount: number;
  invoiceDate: string | null;
  invoiceAmount: number | null;
  billEntryDate: string;
}

/**
 * The checks `createBale` and `updateBale` both need. Returns the failure
 * to show as-is, rather than a boolean, so the caller can just return it.
 */
function parseBaleFields(
  draft: Pick<
    BaleDraft,
    | "type"
    | "metresReceived"
    | "uom"
    | "itemId"
    | "baleCount"
    | "invoiceDate"
    | "invoiceAmount"
    | "billEntryDate"
  >,
): ParsedBaleFields | ActionResult {
  if (draft.itemId.trim() === "") {
    return { ok: false, message: "Choose an item." };
  }
  if (!(BALE_TYPES as readonly string[]).includes(draft.type)) {
    return { ok: false, message: "Choose a type." };
  }
  if (!(UOMS as readonly string[]).includes(draft.uom)) {
    return { ok: false, message: "Choose a unit." };
  }
  if (draft.billEntryDate.trim() === "") {
    return { ok: false, message: "Bill entry date is required." };
  }

  const metresReceived = Number(draft.metresReceived);
  if (!Number.isFinite(metresReceived) || metresReceived <= 0) {
    return { ok: false, message: "Quantity received must be a number greater than zero." };
  }

  const baleCount = draft.baleCount.trim() === "" ? 1 : Number(draft.baleCount);
  if (!Number.isInteger(baleCount) || baleCount <= 0) {
    return { ok: false, message: "Number of bales must be a whole number greater than zero." };
  }

  let invoiceAmount: number | null = null;
  if (draft.invoiceAmount.trim() !== "") {
    invoiceAmount = Number(draft.invoiceAmount);
    if (!Number.isFinite(invoiceAmount) || invoiceAmount < 0) {
      return { ok: false, message: "Bill amount must be a number, zero or greater." };
    }
  }

  return {
    type: draft.type,
    metresReceived,
    uom: draft.uom,
    itemId: draft.itemId,
    baleCount,
    invoiceDate: draft.invoiceDate.trim() === "" ? null : draft.invoiceDate,
    invoiceAmount,
    billEntryDate: draft.billEntryDate,
  };
}

function isFailure(x: ParsedBaleFields | ActionResult): x is ActionResult {
  return "ok" in x;
}

export async function createBale(draft: BaleDraft): Promise<ActionResult> {
  const denied = await guard("floor");
  if (denied !== null) return denied;

  if (draft.supplierId.trim() === "") {
    return { ok: false, message: "Choose a supplier." };
  }

  const parsed = parseBaleFields(draft);
  if (isFailure(parsed)) return parsed;
  const { type, metresReceived, uom, itemId, baleCount, invoiceDate, invoiceAmount, billEntryDate } =
    parsed;

  const actorId = await actingId();

  const [supplierRow] = await db.execute<{ id: string }>(sql`
    select id from supplier where id = ${draft.supplierId}
  `);
  if (supplierRow === undefined) {
    return { ok: false, message: "That supplier no longer exists." };
  }

  const [row] = await db.execute<{ code: string }>(sql`
    insert into bale (
      code, supplier_id, bill_entry_date, transporter, invoice_number, invoice_date,
      invoice_amount, type, metres_received, uom, item_id, bale_count, notes, recorded_by_id
    ) values (
      nextval('bale_code_seq')::text,
      ${draft.supplierId},
      ${billEntryDate},
      ${draft.transporter.trim() || null},
      ${draft.invoiceNumber.trim() || null},
      ${invoiceDate},
      ${invoiceAmount},
      ${type},
      ${metresReceived},
      ${uom},
      ${itemId},
      ${baleCount},
      ${draft.notes.trim() || null},
      ${actorId}
    )
    returning code
  `);

  revalidate();

  return { ok: true, message: `Saved as ${row.code}.` };
}

/**
 * Fixing what was entered — everything except who supplied it. The
 * supplier is fixed once the bale's code is minted, because that code
 * already carries their letter; changing it after the fact would leave a
 * code pointing at the wrong supplier.
 */
export async function updateBale(baleId: string, draft: BaleEditDraft): Promise<ActionResult> {
  const denied = await guard("floor");
  if (denied !== null) return denied;

  const parsed = parseBaleFields(draft);
  if (isFailure(parsed)) return parsed;
  const { type, metresReceived, uom, itemId, baleCount, invoiceDate, invoiceAmount, billEntryDate } =
    parsed;

  const [row] = await db.execute<{ code: string }>(sql`
    update bale
    set
      bill_entry_date = ${billEntryDate},
      transporter = ${draft.transporter.trim() || null},
      invoice_number = ${draft.invoiceNumber.trim() || null},
      invoice_date = ${invoiceDate},
      invoice_amount = ${invoiceAmount},
      type = ${type},
      metres_received = ${metresReceived},
      uom = ${uom},
      item_id = ${itemId},
      bale_count = ${baleCount},
      notes = ${draft.notes.trim() || null},
      updated_at = now()
    where id = ${baleId}
    returning code
  `);

  if (row === undefined) {
    return { ok: false, message: "That bale no longer exists." };
  }

  revalidate();

  return { ok: true, message: `${row.code} updated.` };
}

/**
 * Changing just the Type, from the table cell rather than the full editor —
 * the same column `updateBale` writes, so a faster path isn't a laxer one.
 */
export async function setBaleType(baleId: string, type: string): Promise<ActionResult> {
  const denied = await guard("floor");
  if (denied !== null) return denied;

  if (!(BALE_TYPES as readonly string[]).includes(type)) {
    return { ok: false, message: "Choose a type." };
  }

  const [row] = await db.execute<{ code: string }>(sql`
    update bale set type = ${type}, updated_at = now() where id = ${baleId} returning code
  `);

  if (row === undefined) {
    return { ok: false, message: "That bale no longer exists." };
  }

  revalidate();

  return { ok: true, message: `${row.code} set to ${type}.` };
}

/**
 * A bale sent back to the supplier — wrong material, damaged, short-shipped.
 * Only from `awaiting_cutting`: once a bale is cut it has already become
 * pieces, and there is nothing whole left to send back.
 */
export async function markBaleReturned(baleId: string): Promise<ActionResult> {
  const denied = await guard("floor");
  if (denied !== null) return denied;

  const actorId = await actingId();

  const [row] = await db.execute<{ code: string }>(sql`
    update bale
    set status = 'returned', returned_by_id = ${actorId}, updated_at = now()
    where id = ${baleId} and status = 'awaiting_cutting'
    returning code
  `);

  if (row === undefined) {
    return { ok: false, message: "That bale can no longer be marked returned." };
  }

  revalidate();

  return { ok: true, message: `${row.code} marked returned.` };
}

/**
 * Recording Thaans cut from a bale — as many times as it takes. Whatever
 * count is entered here is created as that many Thaans at once, but the
 * recording itself can repeat across more than one sitting: the business's
 * real process is cut some, note it down, cut more later. The first
 * recording moves the bale out of `awaiting_cutting`; nothing here closes
 * it out — that is `markCuttingComplete`, a deliberate second act once
 * nothing more will be cut from this bale. Codes are not assigned here
 * either; that is `generateQrCodes`, a third.
 */
export async function recordThaans(baleId: string, thaanCount: string): Promise<ActionResult> {
  const denied = await guard("floor");
  if (denied !== null) return denied;

  const count = Number(thaanCount);
  if (!Number.isInteger(count) || count <= 0) {
    return { ok: false, message: "Number of pieces must be a whole number greater than zero." };
  }

  const actorId = await actingId();

  const code = await db.transaction(async (tx) => {
    const [row] = await tx.execute<{ code: string }>(sql`
      update bale
      set status = 'cutting_in_progress', cut_by_id = ${actorId}, updated_at = now()
      where id = ${baleId} and status in ('awaiting_cutting', 'cutting_in_progress')
      returning code
    `);

    if (row === undefined) return null;

    await tx.execute(sql`
      insert into thaan (bale_id)
      select ${baleId} from generate_series(1, ${count})
    `);

    return row.code;
  });

  if (code === null) {
    return { ok: false, message: "That bale can no longer have Thaans recorded against it." };
  }

  revalidate();

  return { ok: true, message: `Recorded ${count} Thaan${count === 1 ? "" : "s"} for ${code}.` };
}

/**
 * Closes a bale's cutting out: nothing more will be cut from it. Only from
 * `cutting_in_progress` — at least one Thaan must already be recorded, or
 * there is nothing to close out.
 */
export async function markCuttingComplete(baleId: string): Promise<ActionResult> {
  const denied = await guard("floor");
  if (denied !== null) return denied;

  const actorId = await actingId();

  const [row] = await db.execute<{ code: string }>(sql`
    update bale
    set status = 'cut', cut_by_id = ${actorId}, updated_at = now()
    where id = ${baleId} and status = 'cutting_in_progress'
    returning code
  `);

  if (row === undefined) {
    return { ok: false, message: "That bale isn't mid-cutting, so there's nothing to complete." };
  }

  revalidate();

  return { ok: true, message: `${row.code} marked cut.` };
}

/**
 * Assigns every Thaan from this bale still waiting on one its permanent
 * code, via `thaan_code_seq` — one statement, so a bale's Thaans are never
 * left half-coded by something failing partway through.
 */
export async function generateQrCodes(baleId: string): Promise<ActionResult> {
  const denied = await guard("floor");
  if (denied !== null) return denied;

  const actorId = await actingId();

  const updated = await db.execute<{ id: string }>(sql`
    update thaan
    set code = 'T' || nextval('thaan_code_seq'),
        qr_generated_at = now(),
        qr_generated_by_id = ${actorId},
        updated_at = now()
    where bale_id = ${baleId} and code is null
    returning id
  `);

  if (updated.length === 0) {
    return { ok: false, message: "No Thaans here are waiting on a QR code." };
  }

  revalidate();
  revalidatePath("/thaans");

  return { ok: true, message: `Generated ${updated.length} QR code${updated.length === 1 ? "" : "s"}.` };
}

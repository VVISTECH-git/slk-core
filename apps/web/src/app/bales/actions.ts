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
  billEntryDate: string;
}

/**
 * The checks `createBale` and `updateBale` both need. Returns the failure
 * to show as-is, rather than a boolean, so the caller can just return it.
 */
function parseBaleFields(
  draft: Pick<
    BaleDraft,
    "type" | "metresReceived" | "uom" | "itemId" | "baleCount" | "invoiceDate" | "billEntryDate"
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

  return {
    type: draft.type,
    metresReceived,
    uom: draft.uom,
    itemId: draft.itemId,
    baleCount,
    invoiceDate: draft.invoiceDate.trim() === "" ? null : draft.invoiceDate,
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
  const { type, metresReceived, uom, itemId, baleCount, invoiceDate, billEntryDate } = parsed;

  const actorId = await actingId();

  const code = await db.transaction(async (tx) => {
    /*
      Claiming this supplier's next number and writing it down happen in
      one transaction, so two staff members recording a bale for the same
      supplier at the same moment never walk away with the same code —
      Postgres serialises the two UPDATEs on this row rather than letting
      them both read "3" and both mint "A3".
    */
    const [supplierRow] = await tx.execute<{ codePrefix: string; number: number }>(sql`
      update supplier
      set next_bale_number = next_bale_number + 1, updated_at = now()
      where id = ${draft.supplierId}
      returning code_prefix as "codePrefix", next_bale_number - 1 as number
    `);

    if (supplierRow === undefined) {
      throw new Error("NO_SUCH_SUPPLIER");
    }

    const code = `${supplierRow.codePrefix}${supplierRow.number}`;

    await tx.execute(sql`
      insert into bale (
        code, supplier_id, bill_entry_date, transporter, invoice_number, invoice_date, type,
        metres_received, uom, item_id, bale_count, notes, recorded_by_id
      ) values (
        ${code},
        ${draft.supplierId},
        ${billEntryDate},
        ${draft.transporter.trim() || null},
        ${draft.invoiceNumber.trim() || null},
        ${invoiceDate},
        ${type},
        ${metresReceived},
        ${uom},
        ${itemId},
        ${baleCount},
        ${draft.notes.trim() || null},
        ${actorId}
      )
    `);

    return code;
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === "NO_SUCH_SUPPLIER") return null;
    throw error;
  });

  if (code === null) {
    return { ok: false, message: "That supplier no longer exists." };
  }

  revalidate();

  return { ok: true, message: `Saved as ${code}.` };
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
  const { type, metresReceived, uom, itemId, baleCount, invoiceDate, billEntryDate } = parsed;

  const [row] = await db.execute<{ code: string }>(sql`
    update bale
    set
      bill_entry_date = ${billEntryDate},
      transporter = ${draft.transporter.trim() || null},
      invoice_number = ${draft.invoiceNumber.trim() || null},
      invoice_date = ${invoiceDate},
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
 * A bale sent back to the supplier — wrong material, damaged, short-shipped.
 * Only from `awaiting_cutting`: once a bale is cut it has already become
 * pieces, and there is nothing whole left to send back.
 */
export async function markBaleReturned(baleId: string): Promise<ActionResult> {
  const denied = await guard("floor");
  if (denied !== null) return denied;

  const [row] = await db.execute<{ code: string }>(sql`
    update bale
    set status = 'returned', updated_at = now()
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
 * Cutting a bale: the whole thing, in one sitting — the business's own
 * rule, not a technical shortcut — so this creates every Thaan the bale
 * becomes at once, rather than accumulating them over several visits.
 * Codes are not assigned here; that is `generateQrCodes`, a deliberate
 * second act.
 */
export async function cutBale(baleId: string, thaanCount: string): Promise<ActionResult> {
  const denied = await guard("floor");
  if (denied !== null) return denied;

  const count = Number(thaanCount);
  if (!Number.isInteger(count) || count <= 0) {
    return { ok: false, message: "Number of pieces must be a whole number greater than zero." };
  }

  const code = await db.transaction(async (tx) => {
    const [row] = await tx.execute<{ code: string }>(sql`
      update bale
      set status = 'cut', updated_at = now()
      where id = ${baleId} and status = 'awaiting_cutting'
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
    return { ok: false, message: "That bale can no longer be cut." };
  }

  revalidate();

  return { ok: true, message: `${code} cut into ${count} Thaan${count === 1 ? "" : "s"}.` };
}

/**
 * Assigns every Thaan from this bale still waiting on one its permanent
 * code, via `thaan_code_seq` — one statement, so a bale's Thaans are never
 * left half-coded by something failing partway through.
 */
export async function generateQrCodes(baleId: string): Promise<ActionResult> {
  const denied = await guard("floor");
  if (denied !== null) return denied;

  const updated = await db.execute<{ id: string }>(sql`
    update thaan
    set code = 'T' || nextval('thaan_code_seq'), qr_generated_at = now(), updated_at = now()
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

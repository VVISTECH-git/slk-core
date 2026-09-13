"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { actingId, guard } from "@/lib/session";

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
 */

export interface BaleDraft {
  supplierName: string;
  transporter: string;
  invoiceNumber: string;
  invoiceDate: string;
  metresReceived: string;
  itemDescription: string;
  baleCount: string;
}

function revalidate() {
  revalidatePath("/bales");
}

export async function createBale(draft: BaleDraft): Promise<ActionResult> {
  const denied = await guard("floor");
  if (denied !== null) return denied;

  const supplierName = draft.supplierName.trim();
  if (supplierName === "") {
    return { ok: false, message: "Supplier is required." };
  }

  const metresReceived = Number(draft.metresReceived);
  if (!Number.isFinite(metresReceived) || metresReceived <= 0) {
    return { ok: false, message: "Metres received must be a number greater than zero." };
  }

  const baleCount = draft.baleCount.trim() === "" ? 1 : Number(draft.baleCount);
  if (!Number.isInteger(baleCount) || baleCount <= 0) {
    return { ok: false, message: "Number of bales must be a whole number greater than zero." };
  }

  const invoiceDate = draft.invoiceDate.trim() === "" ? null : draft.invoiceDate;
  const actorId = await actingId();

  const [row] = await db.execute<{ code: string }>(sql`
    insert into bale (
      code, supplier_name, transporter, invoice_number, invoice_date,
      metres_received, item_description, bale_count, recorded_by_id
    ) values (
      'BALE-' || nextval('bale_code_seq')::text,
      ${supplierName},
      ${draft.transporter.trim() || null},
      ${draft.invoiceNumber.trim() || null},
      ${invoiceDate},
      ${metresReceived},
      ${draft.itemDescription.trim() || null},
      ${baleCount},
      ${actorId}
    )
    returning code
  `);

  if (row === undefined) {
    return { ok: false, message: "Could not save the bale entry." };
  }

  revalidate();

  return { ok: true, message: `Saved as ${row.code}.` };
}

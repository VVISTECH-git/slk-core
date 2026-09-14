"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { actingId, guard } from "@/lib/session";

export interface ActionResult {
  ok: boolean;
  message: string;
}

/**
 * Flags a damaged, miscounted, or otherwise unusable Thaan — reversible,
 * unlike deleting the row, which would break every Handover already
 * pointing at it. Refused if the Thaan is currently out for a stage: it
 * has to come back (or the handover corrected) before it can be voided,
 * the same way a bale can't be marked returned once cut.
 */
export async function voidThaan(thaanId: string): Promise<ActionResult> {
  const denied = await guard("floor");
  if (denied !== null) return denied;

  const actorId = await actingId();

  const [open] = await db.execute<{ stage: string }>(sql`
    select stage from handover where thaan_id = ${thaanId} and received_at is null
  `);
  if (open !== undefined) {
    return { ok: false, message: `Can't void — it's currently out for ${open.stage}.` };
  }

  const [row] = await db.execute<{ code: string | null }>(sql`
    update thaan
    set voided_at = now(), voided_by_id = ${actorId}, updated_at = now()
    where id = ${thaanId} and voided_at is null
    returning code
  `);

  if (row === undefined) {
    return { ok: false, message: "That Thaan no longer exists, or is already voided." };
  }

  revalidatePath("/thaans");

  return { ok: true, message: `${row.code ?? "Thaan"} marked void.` };
}

export async function restoreThaan(thaanId: string): Promise<ActionResult> {
  const denied = await guard("floor");
  if (denied !== null) return denied;

  const [row] = await db.execute<{ code: string | null }>(sql`
    update thaan
    set voided_at = null, voided_by_id = null, updated_at = now()
    where id = ${thaanId} and voided_at is not null
    returning code
  `);

  if (row === undefined) {
    return { ok: false, message: "That Thaan no longer exists, or isn't voided." };
  }

  revalidatePath("/thaans");

  return { ok: true, message: `${row.code ?? "Thaan"} restored.` };
}

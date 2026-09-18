"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { actingId, guard, guardJobRole } from "@/lib/session";
import { loadLatestHandoverForThaan } from "@/lib/thaan-damage";

export interface ActionResult {
  ok: boolean;
  message: string;
}

/** Who may flag a Thaan damaged from the scan lookup screen — see handovers/actions.ts's own HANDOVER_JOB_ROLES, which this must match. */
const DAMAGE_JOB_ROLES = ["Bale Custodian", "Handler"];

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

/**
 * Flags a Thaan damaged — mobile's "Scan a Thaan" screen. Derives the
 * vendor and stage from the Thaan's most recent handover (whoever last
 * held it), but the scanner can override the vendor if it's wrong; the
 * stage itself isn't editable — it's a fact about what already happened,
 * not a judgement call. Also voids the Thaan (`thaan.voidedAt`) so it stops
 * moving through the pipeline: a damaged Thaan is unusable, the same fact
 * `voidThaan` already represents, just recorded here with the extra
 * vendor-accountability trail `thaan_damage` carries that a plain void
 * doesn't. Unlike `voidThaan`, this doesn't refuse a Thaan currently out
 * for a stage — the open handover is exactly where the vendor/stage come
 * from when damage is spotted before it's even scanned back in.
 */
export async function flagThaanDamaged(thaanId: string, vendorId: string | null, notes: string): Promise<ActionResult> {
  const denied = await guardJobRole(DAMAGE_JOB_ROLES);
  if (denied !== null) return denied;

  const actorId = await actingId();
  const latest = await loadLatestHandoverForThaan(thaanId);

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx.execute<{ id: string }>(sql`
      select id from thaan_damage where thaan_id = ${thaanId} and written_off_at is null
    `);
    if (existing !== undefined) return { kind: "already" as const };

    const [t] = await tx.execute<{ code: string | null; voidedAt: string | null }>(sql`
      select code, voided_at as "voidedAt" from thaan where id = ${thaanId}
    `);
    if (t === undefined) return { kind: "missing" as const };

    const stage = latest?.stage ?? null;
    const resolvedVendorId = vendorId ?? latest?.vendorId ?? null;

    if (resolvedVendorId !== null) {
      const [v] = await tx.execute<{ id: string }>(sql`select id from vendor where id = ${resolvedVendorId}`);
      if (v === undefined) return { kind: "bad_vendor" as const };
    }

    await tx.execute(sql`
      insert into thaan_damage (thaan_id, vendor_id, stage, notes, flagged_by_id)
      values (${thaanId}, ${resolvedVendorId}, ${stage}, ${notes.trim() || null}, ${actorId})
    `);

    if (t.voidedAt === null) {
      await tx.execute(sql`
        update thaan set voided_at = now(), voided_by_id = ${actorId}, updated_at = now() where id = ${thaanId}
      `);
    }

    return { kind: "flagged" as const, code: t.code };
  });

  revalidatePath("/thaans");
  revalidatePath("/vendors");
  revalidatePath("/vendor-ledger");

  if (result.kind === "already") {
    return { ok: false, message: "Already flagged damaged." };
  }
  if (result.kind === "missing") {
    return { ok: false, message: "That Thaan no longer exists." };
  }
  if (result.kind === "bad_vendor") {
    return { ok: false, message: "That vendor doesn't exist." };
  }

  return { ok: true, message: `${result.code ?? "Thaan"} flagged damaged.` };
}

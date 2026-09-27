"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { actingId, guard } from "@/lib/session";
import { STAGES, type Stage } from "@/lib/stages";

export type Result = { ok: true; message: string } | { ok: false; message: string };

/**
 * Saves the turnaround standard: for each stage, how many days out before a
 * Thaan is overdue and how many days waiting before it is idle. Admin only,
 * since these decide what turns red on the floor's screen.
 */
export async function saveStageTargets(rows: { stage: string; outDays: string; waitDays: string }[]): Promise<Result> {
  const denied = await guard("floor");
  if (denied !== null) return denied;

  const clean: { stage: Stage; outDays: number; waitDays: number }[] = [];
  for (const r of rows) {
    const stage = STAGES.find((s) => s === r.stage);
    if (stage === undefined) return { ok: false, message: `Unknown stage ${r.stage}.` };
    const out = Number(r.outDays);
    const wait = Number(r.waitDays);
    if (!Number.isFinite(out) || out < 0.1 || out > 365) return { ok: false, message: `${stage}: days out must be between 0.1 and 365.` };
    if (!Number.isFinite(wait) || wait < 0.1 || wait > 365) return { ok: false, message: `${stage}: days waiting must be between 0.1 and 365.` };
    clean.push({ stage, outDays: Math.round(out * 10) / 10, waitDays: Math.round(wait * 10) / 10 });
  }

  const actorId = await actingId();
  await db.transaction(async (tx) => {
    for (const r of clean) {
      await tx.execute(sql`
        insert into stage_target (stage, out_days, wait_days, updated_at, updated_by_id)
        values (${r.stage}, ${r.outDays}, ${r.waitDays}, now(), ${actorId})
        on conflict (stage) do update
          set out_days = excluded.out_days, wait_days = excluded.wait_days,
              updated_at = now(), updated_by_id = excluded.updated_by_id
      `);
    }
  });

  revalidatePath("/control-tower");
  revalidatePath("/control-tower/standards");
  return { ok: true, message: "Standards saved. The Control Tower uses them from its next refresh." };
}

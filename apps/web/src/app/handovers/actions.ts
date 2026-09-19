"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { checkThaanForReceive, checkThaanForSend, type ThaanForReceive, type ThaanForSend } from "@/lib/handovers";
import { actingId, guardJobRole } from "@/lib/session";
import { STAGES, stagesFor, type Stage } from "@/lib/stages";

/** Who may scan a Thaan out and back — see handovers/page.tsx's own copy. */
const HANDOVER_JOB_ROLES = ["Bale Custodian", "Handler"];

export interface ActionResult {
  ok: boolean;
  message: string;
}

/**
 * Every scan calls this first — the same check `sendBatch` re-runs at
 * commit time, just early enough to tell the reader right away rather than
 * after they've scanned another twenty.
 *
 * `stage: null` means "not chosen yet" — the first scan of a batch reads
 * its own next stage back instead of being refused, so the reader can
 * scan straight away rather than looking the stage up and picking it from
 * a dropdown first.
 */
export async function lookupForSend(
  code: string,
  stage: string | null,
): Promise<{ ok: true; thaan: ThaanForSend; stage: Stage } | { ok: false; message: string }> {
  const denied = await guardJobRole(HANDOVER_JOB_ROLES);
  if (denied !== null) return denied;

  if (stage !== null && !(STAGES as readonly string[]).includes(stage)) {
    return { ok: false, message: "Unknown stage." };
  }

  return checkThaanForSend(code, stage as Stage | null);
}

export async function lookupForReceive(
  code: string,
): Promise<{ ok: true; thaan: ThaanForReceive } | { ok: false; message: string }> {
  const denied = await guardJobRole(HANDOVER_JOB_ROLES);
  if (denied !== null) return denied;

  return checkThaanForReceive(code);
}

/**
 * The literal stage order, duplicated here the same way the schema's own
 * check constraints duplicate it — see
 * `packages/db/src/schema/production.ts`. `array[...][n]` is 1-based and
 * returns null past the end, which is exactly "no next stage" for a Thaan
 * that has finished every one.
 *
 * Second Print isn't universal — `bale.needs_second_print` — so which of
 * the two arrays applies depends on the specific Thaan being checked, read
 * fresh per row rather than trusted from the client. Mirrors `stagesFor` in
 * `apps/web/src/lib/stages.ts`.
 */
function stageArraySql(thaanId: string) {
  return sql`
    (case when (select b.needs_second_print from thaan t join bale b on b.id = t.bale_id where t.id = ${thaanId})
      then array['Label Stitching','Salava','Karakkaya','Print','Second Print','Nellateeta','Udukulu','Ironing']::text[]
      else array['Label Stitching','Salava','Karakkaya','Print','Nellateeta','Udukulu','Ironing']::text[]
     end)
  `;
}

/**
 * Sends a scanned batch off for one stage, to one vendor (or in-house).
 * Re-checks "not already out" and "this really is the next stage" per Thaan
 * inside the insert itself, rather than trusting the client's own scan-time
 * check — a second tab, or a batch left open a while, could otherwise send
 * a Thaan twice or out of order.
 */
export async function sendBatch(
  stage: string,
  vendorId: string | null,
  thaanIds: string[],
  /**
   * The last stage of a combined trip — this vendor doing `stage` and every
   * stage after it up to here in one visit, scanned out once and back once.
   * Null (or the same as `stage`) is the ordinary one-stage trip.
   */
  throughStage: string | null = null,
): Promise<ActionResult> {
  const denied = await guardJobRole(HANDOVER_JOB_ROLES);
  if (denied !== null) return denied;

  if (!(STAGES as readonly string[]).includes(stage)) {
    return { ok: false, message: "Choose a stage." };
  }
  if (thaanIds.length === 0) {
    return { ok: false, message: "Nothing scanned yet." };
  }

  const through = throughStage === null || throughStage === stage ? null : throughStage;
  if (through !== null) {
    if (!(STAGES as readonly string[]).includes(through)) {
      return { ok: false, message: "Unknown last stage." };
    }
    if (STAGES.indexOf(through as Stage) < STAGES.indexOf(stage as Stage)) {
      return { ok: false, message: `${through} comes before ${stage} — pick a later stage to finish on.` };
    }
  }

  if (vendorId !== null) {
    const [v] = await db.execute<{ id: string }>(sql`select id from vendor where id = ${vendorId}`);
    if (v === undefined) return { ok: false, message: "That vendor no longer exists." };
  }

  const actorId = await actingId();

  const sent = await db.transaction(async (tx) => {
    let count = 0;
    for (const thaanId of thaanIds) {
      const [row] = await tx.execute<{ id: string }>(sql`
        insert into handover (thaan_id, stage, vendor_id, recorded_by_id, through_stage)
        select ${thaanId}, ${stage}, ${vendorId}, ${actorId}, ${through}::text
        where not exists (
          select 1 from handover where thaan_id = ${thaanId} and received_at is null
        )
        and (
          ${through}::text is null
          or coalesce(array_position(${stageArraySql(thaanId)}, ${through}::text), 0)
             > coalesce(array_position(${stageArraySql(thaanId)}, ${stage}::text), 0)
        )
        and coalesce(
          (${stageArraySql(thaanId)})[
            (select count(*) from handover where thaan_id = ${thaanId} and received_at is not null) + 1
          ],
          ''
        ) = ${stage}
        returning id
      `);
      if (row !== undefined) count++;
    }
    return count;
  });

  revalidatePath("/handovers");

  if (sent === 0) {
    return {
      ok: false,
      message:
        through === null
          ? "None of those could be sent — check they aren't already out, or aren't due for this stage."
          : `None of those could be sent — check they aren't already out, are due for ${stage}, and go through ${through} (Second Print, for one, isn't done on every bale).`,
    };
  }
  if (sent < thaanIds.length) {
    return {
      ok: true,
      message: `Sent ${sent} of ${thaanIds.length} — the rest changed since they were scanned. Re-scan to check them.`,
    };
  }

  const trip =
    through === null
      ? stage
      : STAGES.slice(STAGES.indexOf(stage as Stage), STAGES.indexOf(through as Stage) + 1).join(" + ");
  return { ok: true, message: `Sent ${sent} Thaan${sent === 1 ? "" : "s"} for ${trip}.` };
}

/**
 * Marks a scanned batch received, and bills whatever came back from a
 * vendor: one `vendor_transaction` per distinct (vendor, stage) group in
 * the batch. A group whose vendor has no rate set for that stage still gets
 * a transaction — the work happened, and losing the record because nobody
 * had priced it yet would be worse than an unbilled gap — just with
 * `unit_price`/`amount` left null until Finance prices it by hand
 * (`priceVendorTransactions`). Named in the result so it doesn't go
 * unnoticed.
 */
export async function receiveBatch(thaanIds: string[]): Promise<ActionResult> {
  const denied = await guardJobRole(HANDOVER_JOB_ROLES);
  if (denied !== null) return denied;

  if (thaanIds.length === 0) {
    return { ok: false, message: "Nothing scanned yet." };
  }

  const actorId = await actingId();

  const result = await db.transaction(async (tx) => {
    const closed: { id: string; stage: string; vendorId: string | null }[] = [];
    // The stages a combined trip covers after its first — written here as
    // already-received rows so they're billed exactly like the first.
    const alsoDone: { id: string; stage: string; vendorId: string | null }[] = [];

    for (const thaanId of thaanIds) {
      const [row] = await tx.execute<{
        id: string;
        stage: string;
        vendorId: string | null;
        throughStage: string | null;
        sentAt: string | Date;
        recordedBy: string | null;
      }>(sql`
        update handover
        set received_at = now(), received_by_id = ${actorId}, updated_at = now()
        where thaan_id = ${thaanId} and received_at is null
        returning id, stage, vendor_id as "vendorId", through_stage as "throughStage",
                  sent_at as "sentAt", recorded_by_id as "recordedBy"
      `);
      if (row === undefined) continue;
      closed.push({ id: row.id, stage: row.stage, vendorId: row.vendorId });

      if (row.throughStage !== null) {
        const [bale] = await tx.execute<{ needsSecondPrint: boolean }>(sql`
          select b.needs_second_print as "needsSecondPrint"
          from thaan t join bale b on b.id = t.bale_id where t.id = ${thaanId}
        `);
        const order = stagesFor(bale?.needsSecondPrint ?? true);
        const first = order.indexOf(row.stage as Stage);
        const last = order.indexOf(row.throughStage as Stage);
        for (const s of last > first ? order.slice(first + 1, last + 1) : []) {
          const [extra] = await tx.execute<{ id: string }>(sql`
            insert into handover (thaan_id, stage, vendor_id, sent_at, received_at, recorded_by_id, received_by_id)
            values (${thaanId}, ${s}, ${row.vendorId}, ${row.sentAt}, now(), ${row.recordedBy}, ${actorId})
            returning id
          `);
          if (extra !== undefined) alsoDone.push({ id: extra.id, stage: s, vendorId: row.vendorId });
        }
      }
    }

    const groups = new Map<string, { vendorId: string; stage: string; handoverIds: string[] }>();
    for (const c of [...closed, ...alsoDone]) {
      if (c.vendorId === null) continue; // In-house: nothing owed, nothing to bill.
      const key = `${c.vendorId}::${c.stage}`;
      const group = groups.get(key) ?? { vendorId: c.vendorId, stage: c.stage, handoverIds: [] };
      group.handoverIds.push(c.id);
      groups.set(key, group);
    }

    const billed: string[] = [];
    const needsPricing: string[] = [];

    for (const group of groups.values()) {
      const [rate] = await tx.execute<{ unitPrice: string }>(sql`
        select unit_price as "unitPrice" from vendor_rate
        where vendor_id = ${group.vendorId} and stage = ${group.stage}
      `);

      const pieceCount = group.handoverIds.length;
      const unitPrice = rate === undefined ? null : Number(rate.unitPrice);
      const amount = unitPrice === null ? null : Math.round(unitPrice * pieceCount * 100) / 100;

      const [txn] = await tx.execute<{ id: string }>(sql`
        insert into vendor_transaction (vendor_id, stage, piece_count, unit_price, amount, recorded_by_id)
        values (${group.vendorId}, ${group.stage}, ${pieceCount}, ${unitPrice}, ${amount}, ${actorId})
        returning id
      `);

      await tx.execute(sql`
        update handover
        set vendor_transaction_id = ${txn.id}
        where id in (${sql.join(group.handoverIds.map((id) => sql`${id}`), sql`, `)})
      `);

      if (amount === null) {
        const [v] = await tx.execute<{ name: string }>(sql`select name from vendor where id = ${group.vendorId}`);
        needsPricing.push(`${v?.name ?? "that vendor"} — ${group.stage}: ${pieceCount} pc${pieceCount === 1 ? "" : "s"}`);
      } else {
        billed.push(`${group.stage}: ${pieceCount} pc${pieceCount === 1 ? "" : "s"}, ₹${amount.toLocaleString("en-IN")}`);
      }
    }

    return { received: closed.length, billed, needsPricing };
  });

  revalidatePath("/handovers");
  revalidatePath("/vendors");
  revalidatePath("/vendor-ledger");

  if (result.received === 0) {
    return { ok: false, message: "None of those are currently out for a stage." };
  }

  // Billing detail lives on Vendors and Vendor Ledger; this just flags it
  // right away when something needs Finance's attention.
  const base = `Received ${result.received} Thaan${result.received === 1 ? "" : "s"}.`;
  if (result.needsPricing.length === 0) {
    return { ok: true, message: base };
  }
  return { ok: true, message: `${base} Needs pricing: ${result.needsPricing.join("; ")}.` };
}

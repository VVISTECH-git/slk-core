import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { stagesFor, type Stage } from "@/lib/stages";

/**
 * Kora to Shelf, step three: a Thaan's trip through the stage pipeline. See
 * `packages/db/src/schema/production.ts` for the shape this reads.
 */

/** One (stage, vendor) group of Thaans currently out — not yet received back. */
export type OutstandingGroup = {
  stage: string;
  vendorId: string | null;
  /** "In-house" when `vendorId` is null. */
  vendorName: string;
  count: number;
  /** When the earliest one in this group was sent — how long the oldest has been out. */
  earliestSentAt: string;
};

export async function loadOutstanding(): Promise<OutstandingGroup[]> {
  return db.execute<OutstandingGroup>(sql`
    select
      case when h.through_stage is null then h.stage else h.stage || ' + ' || h.through_stage end as "stage",
      h.vendor_id                                          as "vendorId",
      coalesce(v.name, 'In-house')                         as "vendorName",
      count(*)::int                                        as "count",
      to_char(min(h.sent_at), 'DD Mon YYYY')               as "earliestSentAt"
    from handover h
    left join vendor v on v.id = h.vendor_id
    where h.received_at is null
    group by h.stage, h.through_stage, h.vendor_id, v.name
    order by min(h.sent_at)
  `);
}

export type ThaanForSend = {
  id: string;
  code: string;
  baleCode: string;
  baleType: string;
  itemName: string;
};

/**
 * Whether `code` can be sent for `stage` right now, and the Thaan it names
 * if so. Stage order is a fact about the business, not something a column
 * constraint can express — enforced here rather than in the schema, same
 * reasoning as `packages/db/src/schema/production.ts` gives for `handover`.
 *
 * `stage: null` means "whatever's next for this Thaan" — the first scan of
 * a batch that hasn't had its stage chosen yet reads its answer back to
 * lock the whole batch to that stage, rather than making the reader look
 * up and pick it by hand before scanning anything.
 */
export async function checkThaanForSend(
  code: string,
  stage: Stage | null,
): Promise<{ ok: true; thaan: ThaanForSend; stage: Stage } | { ok: false; message: string }> {
  const trimmed = code.trim();
  if (trimmed === "") return { ok: false, message: "Empty code." };

  const [thaan] = await db.execute<{
    id: string;
    code: string;
    baleCode: string;
    baleType: string;
    itemName: string;
    openStage: string | null;
    completedStages: number;
    voidedAt: string | null;
    needsSecondPrint: boolean;
  }>(sql`
    select
      t.id, t.code,
      b.code                                              as "baleCode",
      b.type                                              as "baleType",
      i.name                                               as "itemName",
      open_h.stage                                         as "openStage",
      coalesce(done.n, 0)::int                              as "completedStages",
      t.voided_at                                           as "voidedAt",
      b.needs_second_print                                  as "needsSecondPrint"
    from thaan t
    join bale b on b.id = t.bale_id
    join cloth_item i on i.id = b.item_id
    left join handover open_h on open_h.thaan_id = t.id and open_h.received_at is null
    left join (
      select thaan_id, count(*) as n from handover where received_at is not null group by thaan_id
    ) done on done.thaan_id = t.id
    where t.code = ${trimmed}
  `);

  if (thaan === undefined) {
    return { ok: false, message: `No Thaan with code "${trimmed}".` };
  }
  if (thaan.voidedAt !== null) {
    return { ok: false, message: `${thaan.code} has been voided — it can't be sent anywhere.` };
  }
  if (thaan.openStage !== null) {
    return { ok: false, message: `${thaan.code} is already out for ${thaan.openStage}.` };
  }

  const expected = stagesFor(thaan.needsSecondPrint)[thaan.completedStages];
  if (expected === undefined) {
    return { ok: false, message: `${thaan.code} has already finished every stage.` };
  }
  if (stage !== null && expected !== stage) {
    return {
      ok: false,
      message: `${thaan.code}'s next stage is ${expected}, not ${stage}.`,
    };
  }

  return {
    ok: true,
    thaan: { id: thaan.id, code: thaan.code, baleCode: thaan.baleCode, baleType: thaan.baleType, itemName: thaan.itemName },
    stage: expected,
  };
}

export type ThaanForReceive = ThaanForSend & {
  stage: string;
  /** The last stage of a combined trip, or null for an ordinary one-stage trip. Receiving closes every stage up to it. */
  throughStage: string | null;
  vendorId: string | null;
  vendorName: string;
};

/** Whether `code` is out for some stage right now, and what it's returning from if so. */
export async function checkThaanForReceive(
  code: string,
): Promise<{ ok: true; thaan: ThaanForReceive } | { ok: false; message: string }> {
  const trimmed = code.trim();
  if (trimmed === "") return { ok: false, message: "Empty code." };

  const [thaan] = await db.execute<{
    id: string;
    code: string;
    baleCode: string;
    baleType: string;
    itemName: string;
    stage: string | null;
    throughStage: string | null;
    vendorId: string | null;
    vendorName: string | null;
  }>(sql`
    select
      t.id, t.code,
      b.code                                              as "baleCode",
      b.type                                              as "baleType",
      i.name                                               as "itemName",
      open_h.stage,
      open_h.through_stage                                 as "throughStage",
      open_h.vendor_id                                     as "vendorId",
      v.name                                                as "vendorName"
    from thaan t
    join bale b on b.id = t.bale_id
    join cloth_item i on i.id = b.item_id
    left join handover open_h on open_h.thaan_id = t.id and open_h.received_at is null
    left join vendor v on v.id = open_h.vendor_id
    where t.code = ${trimmed}
  `);

  if (thaan === undefined) {
    return { ok: false, message: `No Thaan with code "${trimmed}".` };
  }
  if (thaan.stage === null) {
    return { ok: false, message: `${thaan.code} isn't out for any stage.` };
  }

  return {
    ok: true,
    thaan: {
      id: thaan.id,
      code: thaan.code,
      baleCode: thaan.baleCode,
      baleType: thaan.baleType,
      itemName: thaan.itemName,
      stage: thaan.stage,
      throughStage: thaan.throughStage,
      vendorId: thaan.vendorId,
      vendorName: thaan.vendorName ?? "In-house",
    },
  };
}

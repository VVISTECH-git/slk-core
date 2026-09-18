import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

export type { DamagedThaanStatus } from "./damaged-status";
export { damagedThaanStatus } from "./damaged-status";

/**
 * A Thaan's most recent handover — whoever last held it for a stage,
 * whether that row is still open (currently out) or already closed. What
 * flagging a Thaan damaged reads to pre-fill vendor and stage: see
 * `flagThaanDamaged` in `app/thaans/actions.ts`.
 */
export type LatestHandover = {
  vendorId: string | null;
  vendorName: string | null;
  stage: string;
  receivedAt: string | null;
};

export async function loadLatestHandoverForThaan(thaanId: string): Promise<LatestHandover | null> {
  const [row] = await db.execute<LatestHandover>(sql`
    select h.vendor_id as "vendorId", v.name as "vendorName", h.stage, h.received_at as "receivedAt"
    from handover h
    left join vendor v on v.id = h.vendor_id
    where h.thaan_id = ${thaanId}
    order by h.sent_at desc
    limit 1
  `);
  return row ?? null;
}

export type DamagedThaanRow = {
  id: string;
  thaanCode: string | null;
  baleCode: string;
  stage: string | null;
  notes: string | null;
  flaggedAt: string;
  flaggedByName: string | null;
  addressedAt: string | null;
  writtenOffAt: string | null;
};

/** Every Thaan ever flagged damaged against one vendor, newest first — what a vendor's settlement drawer shows to address by. */
export async function loadDamagedThaansForVendor(vendorId: string): Promise<DamagedThaanRow[]> {
  return db.execute<DamagedThaanRow>(sql`
    select
      d.id,
      t.code as "thaanCode",
      b.code as "baleCode",
      d.stage,
      d.notes,
      to_char(d.flagged_at, 'DD Mon YYYY, HH12:MI AM') as "flaggedAt",
      a.name as "flaggedByName",
      to_char(d.addressed_at, 'DD Mon YYYY, HH12:MI AM') as "addressedAt",
      to_char(d.written_off_at, 'DD Mon YYYY, HH12:MI AM') as "writtenOffAt"
    from thaan_damage d
    join thaan t on t.id = d.thaan_id
    join bale b on b.id = t.bale_id
    left join actor a on a.id = d.flagged_by_id
    where d.vendor_id = ${vendorId}
    order by d.flagged_at desc
  `);
}

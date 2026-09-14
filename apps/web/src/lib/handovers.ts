import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { STAGES } from "@/lib/stages";

/**
 * A Thaan moving through the stage pipeline. See
 * `packages/db/src/schema/production.ts` for the state this is built from
 * — no stored status, just handover rows.
 */

export type ThaanForSend = {
  id: string;
  code: string;
  baleCode: string;
  completedStages: string[];
  hasOpenHandover: boolean;
};

/** Looked up by a scan while building a Send batch. */
export async function findThaanForSend(code: string): Promise<ThaanForSend | null> {
  const [row] = await db.execute<ThaanForSend>(sql`
    select
      t.id,
      t.code,
      b.code as "baleCode",
      (
        select coalesce(array_agg(h.stage), '{}')
        from handover h
        where h.thaan_id = t.id and h.received_at is not null
      ) as "completedStages",
      exists(
        select 1 from handover h2 where h2.thaan_id = t.id and h2.received_at is null
      ) as "hasOpenHandover"
    from thaan t
    join bale b on b.id = t.bale_id
    where t.code = ${code}
  `);

  return row ?? null;
}

/** What stage a Thaan needs next, or null if it has finished every stage. */
export function nextStageFor(completedStages: string[]): string | null {
  return STAGES.find((s) => !completedStages.includes(s)) ?? null;
}

export type OpenHandoverRow = {
  handoverId: string;
  thaanId: string;
  code: string;
  baleCode: string;
  stage: string;
  vendorName: string | null;
  sentAt: string;
};

/** Looked up by a scan while building a Receive batch. */
export async function findOpenHandoverByCode(code: string): Promise<OpenHandoverRow | null> {
  const [row] = await db.execute<OpenHandoverRow>(sql`
    select
      h.id                                    as "handoverId",
      t.id                                     as "thaanId",
      t.code,
      b.code                                   as "baleCode",
      h.stage,
      v.name                                   as "vendorName",
      to_char(h.sent_at, 'DD Mon YYYY')        as "sentAt"
    from thaan t
    join bale b on b.id = t.bale_id
    join handover h on h.thaan_id = t.id and h.received_at is null
    left join vendor v on v.id = h.vendor_id
    where t.code = ${code}
  `);

  return row ?? null;
}

/** Everything currently out, for the browsable table. */
export async function loadOutThaans(): Promise<OpenHandoverRow[]> {
  return db.execute<OpenHandoverRow>(sql`
    select
      h.id                                    as "handoverId",
      t.id                                     as "thaanId",
      t.code,
      b.code                                   as "baleCode",
      h.stage,
      v.name                                   as "vendorName",
      to_char(h.sent_at, 'DD Mon YYYY')        as "sentAt"
    from handover h
    join thaan t on t.id = h.thaan_id
    join bale b on b.id = t.bale_id
    left join vendor v on v.id = h.vendor_id
    where h.received_at is null
    order by h.sent_at
  `);
}

export type ReadyCount = {
  stage: string;
  count: number;
};

/** How many Thaans are sitting at home, ready for each stage. */
export async function loadReadyCounts(): Promise<ReadyCount[]> {
  const rows = await db.execute<{ completedStages: string[] }>(sql`
    select
      (
        select coalesce(array_agg(h.stage), '{}')
        from handover h
        where h.thaan_id = t.id and h.received_at is not null
      ) as "completedStages"
    from thaan t
    where t.code is not null
      and not exists (select 1 from handover h2 where h2.thaan_id = t.id and h2.received_at is null)
  `);

  const counts = new Map<string, number>();
  for (const row of rows) {
    const next = nextStageFor(row.completedStages);
    if (next === null) continue;
    counts.set(next, (counts.get(next) ?? 0) + 1);
  }

  return STAGES.map((stage) => ({ stage, count: counts.get(stage) ?? 0 })).filter(
    (r) => r.count > 0,
  );
}

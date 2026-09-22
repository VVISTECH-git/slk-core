import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { STAGES, type Stage } from "@/lib/stages";
import { publicUrl, storageConfigured } from "@/lib/storage";

/**
 * Piles — the Thaans that came back from Print printed the same way. See
 * `packages/db/src/schema/production.ts` (`pile`) for what one is and why
 * it exists from Print onward only.
 */

/** The stages at whose receive a pile may be made or joined. */
export const PILE_STAGES: readonly Stage[] = ["Print", "Second Print", "Nellateeta", "Udukulu", "Ironing"];

/** Whether a Thaan coming back from `stage` may go into a pile. */
export function isPileStage(stage: string): stage is Stage {
  return (PILE_STAGES as readonly string[]).includes(stage);
}

/** The later of two stage names, by pipeline order — a combined trip's "through" stage wins. */
export function laterStage(a: string, b: string | null): string {
  if (b === null) return a;
  return STAGES.indexOf(b as Stage) > STAGES.indexOf(a as Stage) ? b : a;
}

export type PileRow = {
  id: string;
  code: string;
  name: string;
  photoUrl: string | null;
  mainColourId: string | null;
  mainColour: string | null;
  createdStage: string;
  status: "draft" | "ready" | "live";
  thaanCount: number;
  /** The bale codes its Thaans came from — usually one. */
  baleCodes: string[];
  createdAt: string;
  createdByName: string | null;
};

export type PileThaan = {
  id: string;
  code: string | null;
  baleCode: string;
  voidedAt: string | null;
  /** "Out for Nellateeta", "Ready for Udukulu" — where it is now. */
  openStage: string | null;
  completedStages: number;
};

export type PileEventRow = {
  id: string;
  kind: string;
  stage: string | null;
  thaanCode: string | null;
  detail: Record<string, unknown>;
  actorName: string | null;
  at: string;
};

const PILE_COLUMNS = sql`
      p.id,
      p.code,
      p.name,
      p.photo_key                                   as "photoKey",
      p.main_colour_id                              as "mainColourId",
      colour.label                                  as "mainColour",
      p.created_stage                               as "createdStage",
      p.status,
      (select count(*)::int from thaan t where t.pile_id = p.id and t.voided_at is null) as "thaanCount",
      coalesce((
        select array_agg(distinct b.code order by b.code)
        from thaan t join bale b on b.id = t.bale_id
        where t.pile_id = p.id
      ), '{}')                                      as "baleCodes",
      to_char(p.created_at, 'DD Mon YYYY, HH12:MI AM') as "createdAt",
      by.name                                       as "createdByName"`;

const PILE_JOINS = sql`
    left join lookup_value colour on colour.id = p.main_colour_id
    left join actor by on by.id = p.created_by_id`;

function withUrl<T extends { photoKey: string | null }>(row: T): Omit<T, "photoKey"> & { photoUrl: string | null } {
  const { photoKey, ...rest } = row;
  return { ...rest, photoUrl: photoKey !== null && storageConfigured() ? publicUrl(photoKey) : null };
}

/** Every pile, newest first — optionally only one status. */
export async function loadPiles(status?: "draft" | "ready" | "live"): Promise<PileRow[]> {
  const rows = await db.execute<Omit<PileRow, "photoUrl"> & { photoKey: string | null }>(sql`
    select ${PILE_COLUMNS}
    from pile p ${PILE_JOINS}
    ${status === undefined ? sql`` : sql`where p.status = ${status}`}
    order by p.created_at desc
  `);
  return rows.map(withUrl);
}

/** One pile with its Thaans and its history, or null. */
export async function loadPile(
  id: string,
): Promise<(PileRow & { thaans: PileThaan[]; events: PileEventRow[] }) | null> {
  const [row] = await db.execute<Omit<PileRow, "photoUrl"> & { photoKey: string | null }>(sql`
    select ${PILE_COLUMNS}
    from pile p ${PILE_JOINS}
    where p.id = ${id}
  `);
  if (row === undefined) return null;

  const thaans = await db.execute<PileThaan>(sql`
    select
      t.id,
      t.code,
      b.code                                                as "baleCode",
      to_char(t.voided_at, 'DD Mon YYYY')                  as "voidedAt",
      case when open_h.through_stage is null then open_h.stage
           else open_h.stage || ' + ' || open_h.through_stage end as "openStage",
      coalesce(done.n, 0)::int                              as "completedStages"
    from thaan t
    join bale b on b.id = t.bale_id
    left join handover open_h on open_h.thaan_id = t.id and open_h.received_at is null
    left join lateral (
      select count(*)::int as n from handover h where h.thaan_id = t.id and h.received_at is not null
    ) done on true
    where t.pile_id = ${id}
    order by t.code
  `);

  const events = await db.execute<PileEventRow>(sql`
    select
      e.id, e.kind, e.stage, t.code as "thaanCode", e.detail,
      a.name as "actorName",
      to_char(e.at, 'DD Mon YYYY, HH12:MI AM') as "at"
    from pile_event e
    left join thaan t on t.id = e.thaan_id
    left join actor a on a.id = e.actor_id
    where e.pile_id = ${id}
    order by e.at desc, e.id
    limit 200
  `);

  return { ...withUrl(row), thaans, events };
}

export type ColourOption = { id: string; label: string };

/** Product Management's colour list — what a pile's main colour is picked from. */
export async function loadPileColours(): Promise<ColourOption[]> {
  return db.execute<ColourOption>(sql`
    select lv.id, lv.label
    from lookup_value lv join lookup_list ll on ll.id = lv.list_id
    where ll.code = 'colour' and lv.status = 'active' and ll.is_enabled = true
    order by lv.sort_order, lv.label
  `);
}

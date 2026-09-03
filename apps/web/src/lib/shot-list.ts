import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

/**
 * What is still to be photographed.
 *
 * An image row with a slot and no storage key is a decision somebody made —
 * this product needs a picture of its pallu — that nobody has acted on yet.
 * Read one record at a time that is a gap on a screen; read across the whole
 * catalogue it is a worklist, and it is the only view that answers "what
 * should I take the camera to next".
 *
 * Which is a question the web portal never asks, because there the two acts
 * happen in one place: you open a record and upload into it. On a floor they
 * are days and different people apart, so the phone needs the list the desk
 * does not.
 */
/*
  A type alias, not an interface, and that is not a style choice.

  db.execute<T> wants T assignable to Record<string, unknown>. TypeScript gives
  an object type alias an implicit index signature and an interface none, so
  the same shape written as `interface` is rejected. RecordRow next door is a
  type alias for the same reason.
*/
export type ShotListRow = {
  /** The colourway — what a photograph belongs to. */
  id: string;
  name: string;

  /** The consignment, and what somebody is holding paperwork for. */
  productCode: string | null;
  /** Internal, and repeats. Kept for searching, not for leading with. */
  designCode: string;

  colour: string | null;
  colourHex: string | null;

  /** The slots still empty, by name — "Pallu", "Border". */
  pending: string[];
};

export async function loadShotList(): Promise<ShotListRow[]> {
  return db.execute<ShotListRow>(sql`
    select
      cw.id                                   as id,
      d.name                                  as name,
      latest.code                             as "productCode",
      d.code                                  as "designCode",
      colour.label                            as colour,
      colour.meta ->> 'hex'                   as "colourHex",
      array_agg(slot.label order by slot.label) as pending
    from image i
    join colourway cw on cw.id = i.colourway_id
    join design d     on d.id  = cw.design_id
    left join lookup_value slot   on slot.id   = i.slot_id
    left join lookup_value colour on colour.id = cw.colour_id
    -- The newest consignment, the same one the catalogue shows.
    left join lateral (
      select b.code from batch b
      where b.colourway_id = cw.id
      order by b.received_at desc, b.code desc limit 1
    ) latest on true
    where
      -- The whole point: a slot that is wanted and empty.
      i.storage_key is null
      -- Nothing archived. A photograph nobody will take of a product nobody
      -- sells is not work, it is noise on a list meant to be finished.
      and d.status <> 'archived' and cw.is_active
    group by cw.id, d.name, latest.code, d.code, colour.label, colour.meta
    order by d.code
  `);
}

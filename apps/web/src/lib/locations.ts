import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

/**
 * Where stock sits.
 *
 * Reference data, and it belongs on Master Lists beside the vocabulary —
 * that is where someone goes to maintain a controlled list, and looking for
 * Location there and not finding it is a failure of the screen, not of the
 * person looking.
 *
 * It is not a lookup list underneath, and should not become one. The movement
 * ledger points at `location` by foreign key; "how much do we have" is
 * defined as internal minus external, which needs `is_internal`; and a
 * location will want an address before long. A lookup value could carry none
 * of that without hiding it in `meta`.
 */

export interface LocationRow {
  id: string;
  code: string;
  name: string;
  isInternal: boolean;
  isActive: boolean;
  sortOrder: number;
  /** Movements referencing it, either end. Zero means it is safe to delete. */
  movements: number;
  /** Units that have arrived here. */
  inbound: number;
  /** Units that have left here. */
  outbound: number;
}

// What those two numbers mean — `stockAt` — is in @slk/domain, not here.
// This module imports `db`, and anything a client component imports from it
// drags the Postgres driver into the browser bundle.

export async function loadLocations(): Promise<LocationRow[]> {
  const rows = await db.execute<{
    id: string;
    code: string;
    name: string;
    is_internal: boolean;
    is_active: boolean;
    sort_order: number;
    movements: number;
    inbound: number;
    outbound: number;
  }>(sql`
    select
      l.id, l.code, l.name, l.is_internal, l.is_active, l.sort_order,
      (
        select count(*)::int from movement m
        where m.from_location_id = l.id or m.to_location_id = l.id
      ) as movements,
      -- Kept as two directions rather than one net, because what the net
      -- means differs by kind of location. The ledger is append-only and
      -- every qty is positive, so summing each direction is the whole of it.
      coalesce((select sum(m.qty)::int from movement m where m.to_location_id   = l.id), 0) as inbound,
      coalesce((select sum(m.qty)::int from movement m where m.from_location_id = l.id), 0) as outbound
    from location l
    order by l.sort_order, l.name
  `);

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    isInternal: r.is_internal,
    isActive: r.is_active,
    sortOrder: r.sort_order,
    movements: r.movements,
    inbound: r.inbound,
    outbound: r.outbound,
  }));
}

/** The ones a new movement may be sent to or taken from. */
export async function loadPickableLocations(): Promise<
  { id: string; name: string; code: string; isInternal: boolean }[]
> {
  const rows = await db.execute<{
    id: string;
    code: string;
    name: string;
    is_internal: boolean;
  }>(sql`
    select id, code, name, is_internal
    from location
    where is_active
    order by is_internal desc, sort_order, name
  `);

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    isInternal: r.is_internal,
  }));
}

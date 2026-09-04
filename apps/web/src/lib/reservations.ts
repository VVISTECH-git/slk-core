import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

/**
 * Orders waiting to be packed — every open (`held`) reservation, oldest
 * first, with the locations that actually hold stock of that consignment's
 * colourway so the picking list can offer where to pack from without a
 * second round trip.
 *
 * externalOrderName exists on the table for exactly this screen — see its
 * own comment: "for a human reading the picking list, never used as a key."
 */

export interface HoldingLocation {
  id: string;
  name: string;
  qty: number;
}

export interface ReservationRow {
  id: string;
  channelName: string;
  productCode: string;
  designName: string;
  colour: string | null;
  qty: number;
  externalOrderName: string | null;
  createdAt: string;
  holding: HoldingLocation[];
}

export async function loadOpenReservations(): Promise<ReservationRow[]> {
  const rows = await db.execute<{
    id: string;
    channel_name: string;
    product_code: string;
    design_name: string;
    colour: string | null;
    qty: number;
    external_order_name: string | null;
    created_at: string;
    holding: HoldingLocation[];
  }>(sql`
    select
      r.id,
      ch.name              as channel_name,
      b.code                as product_code,
      d.name                 as design_name,
      colour.label             as colour,
      r.qty,
      r.external_order_name,
      to_char(r.created_at, 'DD Mon YYYY, HH12:MI AM') as created_at,
      coalesce((
        select json_agg(json_build_object('id', loc.id, 'name', loc.name, 'qty', loc.qty) order by loc.qty desc)
        from (
          select
            l.id, l.name,
            coalesce(sum(case when m.to_location_id = l.id then m.qty else 0 end), 0)
            - coalesce(sum(case when m.from_location_id = l.id then m.qty else 0 end), 0) as qty
          from location l
          left join movement m
            on (m.to_location_id = l.id or m.from_location_id = l.id)
            and m.colourway_id = b.colourway_id
          where l.is_internal
          group by l.id, l.name
          having
            coalesce(sum(case when m.to_location_id = l.id then m.qty else 0 end), 0)
            - coalesce(sum(case when m.from_location_id = l.id then m.qty else 0 end), 0) > 0
        ) loc
      ), '[]'::json) as holding
    from reservation r
    join channel ch  on ch.id = r.channel_id
    join batch b      on b.id = r.batch_id
    join colourway cw  on cw.id = b.colourway_id
    join design d        on d.id = cw.design_id
    left join lookup_value colour on colour.id = cw.colour_id
    where r.status = 'held'
    order by r.created_at asc
  `);

  return rows.map((r) => ({
    id: r.id,
    channelName: r.channel_name,
    productCode: r.product_code,
    designName: r.design_name,
    colour: r.colour,
    qty: r.qty,
    externalOrderName: r.external_order_name,
    createdAt: r.created_at,
    holding: r.holding,
  }));
}

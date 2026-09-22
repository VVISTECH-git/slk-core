import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

/**
 * From pile to shelf — the last step of Kora to Shelf. A pile whose Thaans
 * have come back from Ironing is finished cloth; putting it on the shelf
 * means the Product Management record gets its price, and the finished
 * Thaans become stock: one consignment into a location, one piece per Thaan
 * (for piece-tracked product types), each piece carrying the Thaan's own
 * code so the label stitched on at the start is the one scanned at the
 * till. A pile can go on the shelf in parts: Thaans still at earlier stages
 * join later, as another consignment, when they finish.
 */

export type ShelfThaan = { id: string; code: string };

export type ShelfDraft = {
  pileId: string;
  pileCode: string;
  pileName: string;
  status: "draft" | "ready" | "live";
  colourwayId: string | null;
  designCode: string | null;
  recordName: string | null;
  /** Whether this record is tracked piece by piece (item codes) rather than by length. */
  pieceTracked: boolean;
  /** Back from Ironing, not voided, not yet on the shelf — what going live puts into stock. */
  finished: ShelfThaan[];
  /** Already stock, with the piece code = Thaan code. */
  shelved: ShelfThaan[];
  /** Still somewhere in the pipeline. */
  inPipeline: number;
  /** Current prices, rupees as strings ("" when not set) — the form's initial values. */
  prices: { cost: string; making: string; wholesale: string; retail: string; mrp: string };
  /** Where stock can be put — every active location we own. */
  locations: { id: string; name: string; code: string }[];
  /** Short reasons this pile can't go on the shelf yet; empty means it can. */
  blockers: string[];
};

function rupees(minor: number | null): string {
  return minor === null ? "" : (minor / 100).toString();
}

export async function loadShelfDraft(pileId: string): Promise<ShelfDraft | null> {
  const [pile] = await db.execute<{
    id: string;
    code: string;
    name: string;
    status: "draft" | "ready" | "live";
    colourwayId: string | null;
    designCode: string | null;
    recordName: string | null;
    pieceTracked: boolean | null;
    cost: number | null;
    making: number | null;
    wholesale: number | null;
    retail: number | null;
    mrp: number | null;
  }>(sql`
    select
      p.id, p.code, p.name, p.status,
      p.colourway_id                                   as "colourwayId",
      d.code                                           as "designCode",
      d.name                                           as "recordName",
      (d.is_serialised and coalesce(uom.code, '') <> 'metre') as "pieceTracked",
      cw.cost_minor::double precision                  as "cost",
      cw.making_minor::double precision                as "making",
      cw.wholesale_minor::double precision             as "wholesale",
      cw.retail_minor::double precision                as "retail",
      cw.mrp_minor::double precision                   as "mrp"
    from pile p
    left join colourway cw on cw.id = p.colourway_id
    left join design d on d.id = cw.design_id
    left join lookup_value uom on uom.id = d.uom_id
    where p.id = ${pileId}
  `);
  if (pile === undefined) return null;

  const thaans = await db.execute<{ id: string; code: string; finished: boolean; shelved: boolean }>(sql`
    select
      t.id, t.code,
      exists (
        select 1 from handover h where h.thaan_id = t.id and h.received_at is not null
          and (h.stage = 'Ironing' or h.through_stage = 'Ironing')
      )                                   as "finished",
      (t.piece_id is not null)            as "shelved"
    from thaan t
    where t.pile_id = ${pileId} and t.voided_at is null and t.code is not null
    order by t.code
  `);

  const locations = await db.execute<{ id: string; name: string; code: string }>(sql`
    select id, name, code from location where is_active and is_internal order by name
  `);

  const finished = thaans.filter((t) => t.finished && !t.shelved).map(({ id, code }) => ({ id, code }));
  const shelved = thaans.filter((t) => t.shelved).map(({ id, code }) => ({ id, code }));
  const inPipeline = thaans.filter((t) => !t.finished && !t.shelved).length;

  const blockers: string[] = [];
  if (pile.colourwayId === null) blockers.push("details not filled in yet");
  if (finished.length === 0) blockers.push(shelved.length > 0 ? "nothing new back from Ironing" : "nothing back from Ironing yet");
  if (locations.length === 0) blockers.push("no location to put stock in");

  return {
    pileId: pile.id,
    pileCode: pile.code,
    pileName: pile.name,
    status: pile.status,
    colourwayId: pile.colourwayId,
    designCode: pile.designCode,
    recordName: pile.recordName,
    pieceTracked: pile.pieceTracked ?? false,
    finished,
    shelved,
    inPipeline,
    prices: {
      cost: rupees(pile.cost),
      making: rupees(pile.making),
      wholesale: rupees(pile.wholesale),
      retail: rupees(pile.retail),
      mrp: rupees(pile.mrp),
    },
    locations,
    blockers,
  };
}

/** Rupees in, paise out. Blank means "not priced", which is not the same as zero. */
export function toMinor(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount < 0) return undefined;
  return Math.round(amount * 100);
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Puts the finished Thaans of a pile into stock, inside `tx`: one
 * consignment into `locationId`, one `received` movement from Production,
 * and — for a piece-tracked record — one piece per Thaan whose code is the
 * Thaan's own. Returns the product code and what became stock.
 */
export async function shelveInTx(
  tx: Tx,
  colourwayId: string,
  thaans: ShelfThaan[],
  locationId: string,
  pieceTracked: boolean,
  note: string,
  actorId: string | null,
): Promise<{ productCode: string; pieceCodes: string[] }> {
  const [source] = await tx.execute<{ id: string }>(sql`
    select id from location where code = 'PRODUCTION'
    union all
    select id from location where not is_internal and code <> 'PRODUCTION'
    limit 1
  `);
  if (source === undefined) throw new Error("No external location is set up to receive stock from.");

  const [batch] = await tx.execute<{ id: string; code: string }>(sql`
    insert into batch (colourway_id, code, qty, location_id, reference, note)
    values (${colourwayId}, nextval('product_code_seq')::text, ${thaans.length}, ${locationId}, null, ${note})
    returning id, code
  `);
  if (batch === undefined) throw new Error("Could not open a consignment.");

  const pieceCodes: string[] = [];
  if (pieceTracked) {
    const [next] = await tx.execute<{ max: number }>(sql`
      select coalesce(max(serial), 0)::int as max from piece where colourway_id = ${colourwayId}
    `);
    let serial = next?.max ?? 0;
    for (const t of thaans) {
      serial += 1;
      const [p] = await tx.execute<{ id: string }>(sql`
        insert into piece (colourway_id, batch_id, code, serial)
        values (${colourwayId}, ${batch.id}, ${t.code}, ${serial})
        returning id
      `);
      if (p === undefined) throw new Error(`Could not make a piece for ${t.code}.`);
      await tx.execute(sql`update thaan set piece_id = ${p.id}, updated_at = now() where id = ${t.id}`);
      pieceCodes.push(t.code);
    }
  }

  await tx.execute(sql`
    insert into movement (colourway_id, batch_id, qty, kind, from_location_id, to_location_id, occurred_at, reason, actor_id)
    values (${colourwayId}, ${batch.id}, ${thaans.length}, 'received', ${source.id}, ${locationId}, now(), ${note}, ${actorId})
  `);

  return { productCode: batch.code, pieceCodes };
}

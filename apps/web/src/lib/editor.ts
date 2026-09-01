import { and, asc, eq, sql } from "drizzle-orm";

import { lookupList, lookupValue } from "@slk/db";

import {
  ATTRIBUTES,
  ATTRIBUTE_KEYS,
  type AttributeKey,
  type Options,
  type RecordDetail,
} from "@/lib/attributes";
import { db } from "@/lib/db";
import { publicUrl } from "@/lib/storage";

/**
 * Server-side reads for the record editor.
 *
 * This module imports `db`, so anything a client component imports from it
 * pulls the Postgres driver into the browser bundle.
 *
 * It used to re-export the pure half from ./attributes as a convenience,
 * which made the module that cannot be imported from the client look like the
 * obvious place to import from. Three separate client components reached for
 * a constant here and broke the build.
 *
 * The re-exports are gone. Pure things — ATTRIBUTES, defaultAttributes,
 * HOME_INDUSTRY, the types — come from "@/lib/attributes", and the only
 * things this file offers are the ones that genuinely need a database.
 */
export type { Option, Options, RecordDetail } from "./attributes";

/** Every active value, grouped by list code, in the workbook's order. */
export async function loadOptions(): Promise<Options> {
  const rows = await db
    .select({
      listCode: lookupList.code,
      id: lookupValue.id,
      label: lookupValue.label,
      parentId: lookupValue.parentValueId,
      soldById: lookupValue.soldById,
      meta: lookupValue.meta,
      isDefault: lookupValue.isDefault,
    })
    .from(lookupValue)
    .innerJoin(lookupList, eq(lookupList.id, lookupValue.listId))
    // Only Active values are offered. Draft is still being worked out,
    // Proposed is awaiting confirmation, and Retired has been withdrawn —
    // none of the three should be selectable on a new record. Moving a value
    // to Active on Master Lists is what puts it in every dropdown here.
    // …and only from classifications that are switched on. Disabling one in
    // Master Lists is how a question stops being asked altogether,
    // as against retiring its values one at a time.
    .where(and(eq(lookupValue.status, "active"), eq(lookupList.isEnabled, true)))
    .orderBy(asc(lookupList.code), asc(lookupValue.sortOrder));

  const options: Options = {};

  for (const row of rows) {
    (options[row.listCode] ??= []).push({
      id: row.id,
      label: row.label,
      parentId: row.parentId,
      soldById: row.soldById,
      isDefault: row.isDefault,
      hex:
        typeof row.meta === "object" &&
        row.meta !== null &&
        "hex" in row.meta &&
        typeof (row.meta as { hex: unknown }).hex === "string"
          ? (row.meta as { hex: string }).hex
          : null,
    });
  }

  return options;
}

export async function loadRecord(
  colourwayId: string,
): Promise<RecordDetail | null> {
  const selects = ATTRIBUTE_KEYS.map(
    (key) => sql`d.${sql.identifier(ATTRIBUTES[key].column)} as ${sql.identifier(key)}`,
  );

  /*
    All five at once.

    They ran one after another, which is free on a database in the same room
    and ruinous on one that is not: the functions were in Washington and the
    database is in Singapore, so each was a round trip across the Pacific and
    opening a record took six seconds. vercel.json now pins the functions
    beside the database, and this makes the count of round trips one instead
    of five, which is worth having whatever the distance.

    Only siblings depended on anything — it needs the design id, which the
    first query was fetching. A subquery on an indexed primary key costs
    nothing and dissolves the dependency, so nothing has to wait.
  */
  const [
    rows,
    siblings,
    totalsRows,
    byLocation,
    movements,
    consignments,
    images,
    descriptors,
  ] = await Promise.all([
    db.execute<Record<string, unknown>>(sql`
      select
        cw.id as id, d.id as "designId", d.code, d.name,
        d.name_is_custom as "nameIsCustom", d.is_serialised as "isSerialised",
        d.notes,
        cw.colour_id as "colourId",
        cw.cost_minor as "costMinor", cw.making_minor as "makingMinor",
        cw.wholesale_minor as "wholesaleMinor", cw.retail_minor as "retailMinor",
        cw.mrp_minor as "mrpMinor",
        ${sql.join(selects, sql`, `)}
      from colourway cw join design d on d.id = cw.design_id
      where cw.id = ${colourwayId}
    `),

    db.execute<{ id: string; colour: string | null }>(sql`
      select cw.id, v.label as colour
      from colourway cw
      left join lookup_value v on v.id = cw.colour_id
      where cw.design_id = (
        select design_id from colourway where id = ${colourwayId}
      ) and cw.is_active
      order by v.sort_order
    `),

    loadTotals(colourwayId),
    loadByLocation(colourwayId),
    loadMovements(colourwayId),
    loadConsignments(colourwayId),
    loadImages(colourwayId),
    loadDescriptors(colourwayId),
  ]);

  const row = rows[0];
  if (row === undefined) return null;

  const attributes: Partial<Record<AttributeKey, string | null>> = {};
  for (const key of ATTRIBUTE_KEYS) {
    attributes[key] = (row[key] as string | null) ?? null;
  }

  const totals = totalsRows[0];

  return {
    id: row["id"] as string,
    designId: row["designId"] as string,
    code: row["code"] as string,
    name: row["name"] as string,
    nameIsCustom: row["nameIsCustom"] as boolean,
    isSerialised: row["isSerialised"] as boolean,
    notes: (row["notes"] as string | null) ?? null,
    colourId: (row["colourId"] as string | null) ?? null,
    costMinor: (row["costMinor"] as number | null) ?? null,
    makingMinor: (row["makingMinor"] as number | null) ?? null,
    wholesaleMinor: (row["wholesaleMinor"] as number | null) ?? null,
    retailMinor: (row["retailMinor"] as number | null) ?? null,
    mrpMinor: (row["mrpMinor"] as number | null) ?? null,
    attributes,
    siblings,
    stock: { ...totals!, byLocation },
    consignments,
    images,
    descriptors: descriptors.map((d) => d.id),
    movements,
  };
}

/** Every kind counted once, from the ledger. Nothing here is stored. */
function loadTotals(colourwayId: string) {
  return db.execute<{
    onHand: number;
    received: number;
    sold: number;
    damaged: number;
    returned: number;
    adjusted: number;
  }>(sql`
    select
      coalesce((select qty from colourway_on_hand where colourway_id = ${colourwayId}), 0)::int as "onHand",
      coalesce(sum(qty) filter (where kind = 'received'), 0)::int   as received,
      coalesce(sum(qty) filter (where kind = 'sold'), 0)::int       as sold,
      coalesce(sum(qty) filter (where kind = 'damaged'), 0)::int    as damaged,
      coalesce(sum(qty) filter (where kind = 'returned'), 0)::int   as returned,
      coalesce(sum(qty) filter (where kind = 'adjusted'), 0)::int   as adjusted
    from movement where colourway_id = ${colourwayId}
  `);
}

/** What sits where, counting only the locations we hold stock in. */
function loadByLocation(colourwayId: string) {
  return db.execute<{ location: string; qty: number }>(sql`
    select l.name as location,
           (sum(case when m.to_location_id = l.id then m.qty else 0 end)
            - sum(case when m.from_location_id = l.id then m.qty else 0 end))::int as qty
    from movement m
    join location l on l.id in (m.to_location_id, m.from_location_id)
    where m.colourway_id = ${colourwayId} and l.is_internal
    group by l.id, l.name, l.sort_order
    having (sum(case when m.to_location_id = l.id then m.qty else 0 end)
            - sum(case when m.from_location_id = l.id then m.qty else 0 end)) > 0
    order by l.sort_order
  `);
}

/** The last few events, most recent first. */
function loadMovements(colourwayId: string) {
  return db.execute<RecordDetail["movements"][number]>(sql`
    select m.id, m.kind, m.qty,
           to_char(m.occurred_at, 'DD Mon YYYY') as "occurredAt",
           m.reason,
           lf.name as from, lt.name as to
    from movement m
    left join location lf on lf.id = m.from_location_id
    left join location lt on lt.id = m.to_location_id
    where m.colourway_id = ${colourwayId}
    order by m.occurred_at desc, m.id desc
    limit 8
  `);
}

/**
 * What arrived and when, newest first, with the item codes minted under each.
 *
 * `array_remove` because a consignment of unserialised cloth has no pieces,
 * and the left join then aggregates a single null — `{null}` is not an empty
 * list, and would render as one blank item code.
 */
function loadConsignments(colourwayId: string) {
  return db.execute<RecordDetail["consignments"][number]>(sql`
    select
      b.id, b.code, b.qty,
      l.name                                        as location,
      to_char(b.received_at, 'DD Mon YYYY')         as "receivedAt",
      b.reference, b.note,
      array_remove(array_agg(p.code order by p.serial), null) as items
    from batch b
    left join location l on l.id = b.location_id
    left join piece p    on p.batch_id = b.id
    where b.colourway_id = ${colourwayId}
    group by b.id, l.name
    order by b.received_at desc, b.code desc
  `);
}

/**
 * The adjectives on this design, in the order the list holds them.
 *
 * Ordered by the value's own sort order rather than by when it was ticked, so
 * the composed name reads the same however it was filled in — "Soft Pure",
 * never "Pure Soft" because somebody happened to tick that one first.
 */
function loadDescriptors(colourwayId: string) {
  return db.execute<{ id: string }>(sql`
    select dd.descriptor_id as id
    from design_descriptor dd
    join lookup_value v on v.id = dd.descriptor_id
    where dd.design_id = (
      select design_id from colourway where id = ${colourwayId}
    )
    order by v.sort_order, v.label
  `);
}

/**
 * Which photographs this product should have, and which have arrived.
 *
 * A row with a slot and no storage key is a photograph somebody has decided
 * is wanted and nobody has taken yet — which is the useful half of this
 * table until there is somewhere to upload to.
 */
async function loadImages(
  colourwayId: string,
): Promise<RecordDetail["images"]> {
  const rows = await db.execute<{ slotId: string | null; storageKey: string | null }>(sql`
    select slot_id as "slotId", storage_key as "storageKey"
    from image where colourway_id = ${colourwayId}
  `);

  return rows.map((r) => ({
    slotId: r.slotId,
    url: r.storageKey === null ? null : publicUrl(r.storageKey),
  }));
}

import { sql, type SQL } from "drizzle-orm";

import { designCode, designName } from "@slk/domain";

import { ATTRIBUTES, ATTRIBUTE_KEYS, type AttributeKey, type DesignExtra } from "@/lib/attributes";

/**
 * Writing a design the same way from two doors.
 *
 * A record used to be made in one place only, by the entry form, with a
 * price and a consignment. Now the receive at the door makes one too — a
 * draft, priced later, whose stock arrives Thaan by Thaan — inside the same
 * transaction that closes the handovers. What must not differ between the
 * two is how the code and the name are composed and how serialisation and
 * the unit are decided, so those live here and take whichever executor the
 * caller has: the database, or a transaction.
 */

/** A database or a transaction — a PgTransaction is not a PostgresJsDatabase, and both can execute. */
export type Executor = { execute: (query: SQL) => Promise<unknown> };

async function rows<T>(ex: Executor, query: SQL): Promise<T[]> {
  return (await ex.execute(query)) as T[];
}

/**
 * Whether this design is tagged piece by piece — read from the product
 * type's own flag, not compared against the word "Saree", which is a label
 * anyone can edit on Master Lists.
 */
export async function isSerialised(ex: Executor, productTypeId: string | null): Promise<boolean> {
  if (productTypeId === null || productTypeId === "") return false;
  const [row] = await rows<{ serialised: boolean }>(ex, sql`
    select coalesce((meta ->> 'serialised')::boolean, false) as serialised
    from lookup_value where id = ${productTypeId}
  `);
  return row?.serialised ?? false;
}

/**
 * Unit of Measure, from the product type (Fabric sells by the Metre, most
 * things by the Piece) — except a Fabric design whose Product Sub Type is
 * a matched set bought whole, which is by the Piece regardless.
 */
export async function resolveUom(
  ex: Executor,
  productTypeId: string | null,
  garmentTypeId: string | null,
): Promise<string | null> {
  if (productTypeId === null || productTypeId === "") return null;

  const [productType] = await rows<{ soldById: string | null }>(ex, sql`
    select sold_by_id as "soldById" from lookup_value where id = ${productTypeId}
  `);
  if (productType === undefined) return null;

  if (garmentTypeId !== null && garmentTypeId !== "") {
    const [isMatchedSet] = await rows<{ pieces: boolean }>(ex, sql`
      select true as pieces from lookup_value where id = ${garmentTypeId} and meta ? 'pieces'
    `);
    if (isMatchedSet !== undefined) {
      const [pieceUom] = await rows<{ id: string }>(ex, sql`
        select lv.id from lookup_value lv join lookup_list ll on ll.id = lv.list_id
        where ll.code = 'uom' and lv.code = 'piece'
      `);
      return pieceUom?.id ?? productType.soldById;
    }
  }

  return productType.soldById;
}

/** Labels for the values ids point at, so a name can be composed. */
export async function labelsFor(ex: Executor, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const present = ids.filter((id): id is string => typeof id === "string" && id !== "");
  if (present.length === 0) return new Map();
  const found = await rows<{ id: string; label: string }>(ex, sql`
    select id, label from lookup_value
    where id in (${sql.join(present.map((id) => sql`${id}`), sql`, `)})
  `);
  return new Map(found.map((r) => [r.id, r.label]));
}

export interface NewDesignInput {
  attributes: Partial<Record<AttributeKey, string | null>>;
  colourId: string | null;
  secondaryColourId: string | null;
  extra: DesignExtra;
  notes: string | null;
  actorId: string | null;
}

/**
 * Mints a design and its first colourway from a set of attributes: the next
 * sequence number, the composed code and name, serialisation and unit
 * re-read from the product type. No price, no stock, no descriptors — a
 * draft, review status `draft`, for whoever fills the rest in later.
 */
export async function insertDesignWithColourway(
  ex: Executor,
  input: NewDesignInput,
): Promise<{ id: string; designId: string; code: string; name: string }> {
  const attributes = { ...input.attributes };
  const labels = await labelsFor(ex, ATTRIBUTE_KEYS.map((k) => attributes[k]));
  const label = (key: AttributeKey) => {
    const id = attributes[key];
    return id ? (labels.get(id) ?? null) : null;
  };

  const productTypeId = attributes.productType ?? attributes.homeProductType ?? null;
  const productType = label("productType") ?? label("homeProductType");
  const serialised = await isSerialised(ex, productTypeId);
  attributes.uom = await resolveUom(ex, productTypeId, attributes.garmentType ?? null);

  const [last] = await rows<{ max: number }>(ex, sql`select coalesce(max(seq), 0)::int as max from design`);
  const seq = (last?.max ?? 0) + 1;

  const code = designCode({
    productType,
    regionalStyle: label("regionalStyle"),
    fibreType: label("fibreType"),
    seq,
  });
  const name = designName({
    descriptors: [],
    craftTechnique: label("craftTechnique"),
    regionalStyle: label("regionalStyle"),
    silkSubFamily: label("silkSubFamily"),
    cottonSubFamily: label("cottonSubFamily"),
    fibreType: label("fibreType"),
    garmentType: label("garmentType"),
    productType,
  });

  const columns = ATTRIBUTE_KEYS.map((key) => sql.identifier(ATTRIBUTES[key].column));
  const values = ATTRIBUTE_KEYS.map((key) => {
    const value = attributes[key];
    return sql`${value === "" ? null : (value ?? null)}`;
  });

  const [design] = await rows<{ id: string }>(ex, sql`
    insert into design (code, seq, name, name_is_custom, is_serialised, notes, extra, ${sql.join(columns, sql`, `)})
    values (
      ${code}, ${seq}, ${name}, false, ${serialised},
      ${input.notes}, ${JSON.stringify(input.extra ?? {})}::jsonb,
      ${sql.join(values, sql`, `)}
    )
    returning id
  `);
  if (design === undefined) throw new Error("Could not create the design.");

  const [cw] = await rows<{ id: string }>(ex, sql`
    insert into colourway (design_id, colour_id, secondary_colour_id, created_by_id, updated_by_id)
    values (${design.id}, ${input.colourId}, ${input.secondaryColourId}, ${input.actorId}, ${input.actorId})
    returning id
  `);
  if (cw === undefined) throw new Error("Could not create the colourway.");

  return { id: cw.id, designId: design.id, code, name };
}

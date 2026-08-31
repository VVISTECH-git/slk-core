"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { colourway, design, location, movement } from "@slk/db";
import { designCode, designName } from "@slk/domain";

import { db } from "@/lib/db";
import { ATTRIBUTES, ATTRIBUTE_KEYS, type AttributeKey } from "@/lib/editor";

export interface ActionResult {
  ok: boolean;
  message: string;
  /** Field key → what is wrong with it, so the editor can point at a tab. */
  errors?: Record<string, string>;
}

/** Everything the editor can change, as it arrives from the form. */
export interface RecordDraft {
  colourwayId?: string;
  attributes: Partial<Record<AttributeKey, string | null>>;
  colourId: string | null;
  prices: {
    cost: string;
    making: string;
    wholesale: string;
    retail: string;
    mrp: string;
  };
  quantity: string;

  /**
   * Opening stock, split across the places it actually sits.
   *
   * A total on its own cannot be acted on — "we have twelve" does not tell
   * anyone which shop to send a customer to. Each line becomes one `received`
   * movement into that location, so the total is a sum of recorded events
   * rather than a number somebody typed, and the per-location breakdown on
   * the Stock tab is true from the moment the record exists.
   *
   * New records only. Moving existing stock between locations is a transfer,
   * which is a different act and wants its own screen.
   */
  openingStock: { locationId: string; qty: string }[];

  notes: string;
  name: string;
  nameIsCustom: boolean;
}

const REQUIRED: { key: string; label: string }[] = [
  { key: "industry", label: "Industry" },
  { key: "productType", label: "Product type" },
  { key: "colour", label: "Colour" },
  { key: "fibreType", label: "Fiber type" },
  { key: "craftTechnique", label: "Craft technique" },
];

/** Rupees in, paise out. Blank means "not priced", which is not the same as zero. */
function toMinor(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;

  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount < 0) return null;

  return Math.round(amount * 100);
}

function validate(draft: RecordDraft): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const { key, label } of REQUIRED) {
    const value =
      key === "colour"
        ? draft.colourId
        : draft.attributes[key as AttributeKey];

    if (value === null || value === undefined || value === "") {
      errors[key] = `${label} is needed`;
    }
  }

  if (draft.prices.retail.trim() === "") {
    errors["retail"] = "A selling price is needed";
  }

  for (const [key, value] of Object.entries(draft.prices)) {
    if (value.trim() !== "" && toMinor(value) === null) {
      errors[key] = "Not a price";
    }
  }

  return errors;
}

/** Labels for the values an id points at, so a name can be composed. */
async function labelsFor(
  ids: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const present = ids.filter((id): id is string => typeof id === "string" && id !== "");
  if (present.length === 0) return new Map();

  const rows = await db.execute<{ id: string; label: string }>(sql`
    select id, label from lookup_value
    where id in (${sql.join(present.map((id) => sql`${id}`), sql`, `)})
  `);

  return new Map(rows.map((r) => [r.id, r.label]));
}

export async function saveRecord(draft: RecordDraft): Promise<ActionResult> {
  const errors = validate(draft);

  if (Object.keys(errors).length > 0) {
    return { ok: false, message: "Some fields still need attention.", errors };
  }

  if (draft.colourwayId === undefined) {
    return { ok: false, message: "No record to save." };
  }

  const existing = await db
    .select()
    .from(colourway)
    .where(eq(colourway.id, draft.colourwayId));

  const cw = existing[0];
  if (cw === undefined) return { ok: false, message: "That record no longer exists." };

  const labels = await labelsFor([
    ...ATTRIBUTE_KEYS.map((k) => draft.attributes[k]),
    draft.colourId,
  ]);

  const label = (key: AttributeKey) => {
    const id = draft.attributes[key];
    return id ? (labels.get(id) ?? null) : null;
  };

  // The name is composed unless somebody has typed over it.
  const composed = designName({
    descriptor: label("descriptor"),
    craftTechnique: label("craftTechnique"),
    regionalStyle: label("regionalStyle"),
    silkSubFamily: label("silkSubFamily"),
    cottonSubFamily: label("cottonSubFamily"),
    fibreType: label("fibreType"),
    garmentType: label("garmentType"),
    productType: label("productType") ?? label("homeProductType"),
  });

  const assignments = ATTRIBUTE_KEYS.map((key) => {
    const value = draft.attributes[key];
    return sql`${sql.identifier(ATTRIBUTES[key].column)} = ${value === "" ? null : (value ?? null)}`;
  });

  await db.transaction(async (tx) => {
    // Attributes live on the design, so this reaches every colour under it.
    await tx.execute(sql`
      update design set
        ${sql.join(assignments, sql`, `)},
        name = ${draft.nameIsCustom ? draft.name : composed},
        name_is_custom = ${draft.nameIsCustom},
        notes = ${draft.notes.trim() === "" ? null : draft.notes},
        updated_at = now()
      where id = ${cw.designId}
    `);

    await tx
      .update(colourway)
      .set({
        colourId: draft.colourId,
        costMinor: toMinor(draft.prices.cost),
        makingMinor: toMinor(draft.prices.making),
        wholesaleMinor: toMinor(draft.prices.wholesale),
        retailMinor: toMinor(draft.prices.retail),
        mrpMinor: toMinor(draft.prices.mrp),
        updatedAt: new Date(),
      })
      .where(eq(colourway.id, cw.id));
  });

  const adjustment = await correctCount(cw.id, draft.quantity);

  revalidatePath("/records");

  return {
    ok: true,
    message: `Saved.${adjustment === null ? "" : ` ${adjustment}`}`,
  };
}

/**
 * Brings the count to a number by appending a movement, never by writing one.
 *
 * Returns a sentence describing what it recorded, or null if nothing was
 * needed. Serialised designs are left alone: their count is the number of
 * tagged pieces, and changing that means minting or retiring a piece.
 */
async function correctCount(
  colourwayId: string,
  wanted: string,
): Promise<string | null> {
  if (wanted.trim() === "") return null;

  const target = Math.round(Number(wanted));
  if (!Number.isFinite(target) || target < 0) return null;

  const [row] = await db.execute<{ onHand: number; serialised: boolean }>(sql`
    select coalesce(oh.qty, 0)::int as "onHand", d.is_serialised as serialised
    from colourway cw
    join design d on d.id = cw.design_id
    left join colourway_on_hand oh on oh.colourway_id = cw.id
    where cw.id = ${colourwayId}
  `);

  if (row === undefined || row.serialised) return null;

  const difference = target - row.onHand;
  if (difference === 0) return null;

  const locations = await db.select().from(location);
  const warehouse = locations.find((l) => l.code === "WH-MAIN") ?? locations.find((l) => l.isInternal);
  const shrinkage = locations.find((l) => l.code === "SCRAP") ?? locations.find((l) => !l.isInternal);

  if (warehouse === undefined || shrinkage === undefined) {
    return "Count not corrected — no locations are set up.";
  }

  // A positive correction brings stock in from nowhere; a negative one sends
  // it out. Both are movements between two places, like everything else.
  await db.insert(movement).values({
    colourwayId,
    qty: Math.abs(difference),
    kind: "adjusted",
    fromLocationId: difference > 0 ? shrinkage.id : warehouse.id,
    toLocationId: difference > 0 ? warehouse.id : shrinkage.id,
    occurredAt: new Date(),
    reason: "Corrected on the record editor",
  });

  return `Stock adjusted by ${difference > 0 ? "+" : ""}${difference}.`;
}

/**
 * Takes a record out of the catalogue.
 *
 * Not a delete. The movements referencing this colourway are the stock
 * history, and removing the row either orphans them or is refused by the
 * foreign key. Archiving stops it being listed and leaves the ledger able to
 * answer what happened.
 */
export async function archiveRecord(colourwayId: string): Promise<ActionResult> {
  const rows = await db
    .select({ designId: colourway.designId })
    .from(colourway)
    .where(eq(colourway.id, colourwayId));

  const row = rows[0];
  if (row === undefined) return { ok: false, message: "That record no longer exists." };

  const [remaining] = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from colourway
    where design_id = ${row.designId} and is_active and id <> ${colourwayId}
  `);

  await db.transaction(async (tx) => {
    await tx
      .update(colourway)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(colourway.id, colourwayId));

    // The last colour going means the design itself is finished.
    if ((remaining?.n ?? 0) === 0) {
      await tx
        .update(design)
        .set({ status: "archived", updatedAt: new Date() })
        .where(eq(design.id, row.designId));
    }
  });

  revalidatePath("/records");

  return {
    ok: true,
    message:
      (remaining?.n ?? 0) === 0
        ? "Record archived. Its stock history is kept."
        : "Colour archived. The design's other colours are unaffected.",
  };
}

/** A new colour under an existing design — the common way stock arrives. */
export async function copyRecord(colourwayId: string): Promise<ActionResult> {
  const rows = await db
    .select()
    .from(colourway)
    .where(eq(colourway.id, colourwayId));

  const source = rows[0];
  if (source === undefined) return { ok: false, message: "Nothing to copy." };

  const [made] = await db
    .insert(colourway)
    .values({
      designId: source.designId,
      // Colour is deliberately blank: a copy exists to become a different
      // colour, and carrying the old one over would trip the unique index.
      colourId: null,
      costMinor: source.costMinor,
      makingMinor: source.makingMinor,
      wholesaleMinor: source.wholesaleMinor,
      retailMinor: source.retailMinor,
      mrpMinor: source.mrpMinor,
    })
    .returning();

  revalidatePath("/records");

  return {
    ok: made !== undefined,
    message: "Copied. Give it a colour and a price, then save.",
  };
}

/** A brand-new design, minted with the next sequence number. */
export async function createRecord(draft: RecordDraft): Promise<ActionResult> {
  const errors = validate(draft);

  if (Object.keys(errors).length > 0) {
    return { ok: false, message: "Some fields still need attention.", errors };
  }

  const labels = await labelsFor([
    ...ATTRIBUTE_KEYS.map((k) => draft.attributes[k]),
    draft.colourId,
  ]);

  const label = (key: AttributeKey) => {
    const id = draft.attributes[key];
    return id ? (labels.get(id) ?? null) : null;
  };

  const productType = label("productType") ?? label("homeProductType");

  const [last] = await db
    .select({ max: sql<number>`coalesce(max(${design.seq}), 0)::int` })
    .from(design);

  const seq = (last?.max ?? 0) + 1;

  const code = designCode({
    productType,
    regionalStyle: label("regionalStyle"),
    fibreType: label("fibreType"),
    seq,
  });

  const name = designName({
    descriptor: label("descriptor"),
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
    const value = draft.attributes[key];
    return sql`${value === "" ? null : (value ?? null)}`;
  });

  const [created] = await db.execute<{ id: string }>(sql`
    insert into design (code, seq, name, name_is_custom, is_serialised, notes, ${sql.join(columns, sql`, `)})
    values (
      ${code}, ${seq}, ${draft.nameIsCustom ? draft.name : name},
      ${draft.nameIsCustom}, ${productType === "Saree"},
      ${draft.notes.trim() === "" ? null : draft.notes},
      ${sql.join(values, sql`, `)}
    )
    returning id
  `);

  if (created === undefined) return { ok: false, message: "Could not create the record." };

  const [cw] = await db
    .insert(colourway)
    .values({
      designId: created.id,
      colourId: draft.colourId,
      costMinor: toMinor(draft.prices.cost),
      makingMinor: toMinor(draft.prices.making),
      wholesaleMinor: toMinor(draft.prices.wholesale),
      retailMinor: toMinor(draft.prices.retail),
      mrpMinor: toMinor(draft.prices.mrp),
    })
    .returning({ id: colourway.id });

  const opening =
    cw === undefined ? null : await recordOpeningStock(cw.id, draft.openingStock);

  revalidatePath("/records");

  return {
    ok: true,
    message: `Created ${code}.${opening === null ? "" : ` ${opening}`}`,
  };
}

/**
 * Writes the opening quantities as movements.
 *
 * Stock does not appear; it comes from somewhere. Each line is recorded as
 * arriving from Production into the location it was counted in, which is what
 * makes the opening count explicable a year later — the same reason the
 * ledger is append-only and every quantity is positive.
 *
 * Returns a sentence describing what it recorded, or null if there was
 * nothing to record.
 */
async function recordOpeningStock(
  colourwayId: string,
  lines: { locationId: string; qty: string }[],
): Promise<string | null> {
  const wanted = lines
    .map((line) => ({ locationId: line.locationId, qty: Math.round(Number(line.qty)) }))
    .filter(
      (line) =>
        line.locationId !== "" && Number.isFinite(line.qty) && line.qty > 0,
    );

  if (wanted.length === 0) return null;

  const locations = await db.select().from(location);
  const byId = new Map(locations.map((l) => [l.id, l]));

  // Where stock comes from when it is first counted. Production rather than
  // nothing, because a movement has to come from somewhere or go somewhere.
  const source =
    locations.find((l) => l.code === "PRODUCTION") ??
    locations.find((l) => !l.isInternal);

  if (source === undefined) {
    return "Opening stock not recorded — no external location is set up to receive it from.";
  }

  const usable = wanted.filter((line) => {
    const target = byId.get(line.locationId);
    // Not into Production itself: that would be a movement to where it
    // already is, which the ledger refuses and which records nothing.
    return target !== undefined && target.isActive && target.id !== source.id;
  });

  if (usable.length === 0) return null;

  await db.insert(movement).values(
    usable.map((line) => ({
      colourwayId,
      qty: line.qty,
      kind: "received",
      fromLocationId: source.id,
      toLocationId: line.locationId,
      occurredAt: new Date(),
      reason: "Opening stock",
    })),
  );

  const total = usable.reduce((sum, line) => sum + line.qty, 0);

  return usable.length === 1
    ? `${total} into ${byId.get(usable[0]!.locationId)?.name}.`
    : `${total} across ${usable.length} locations.`;
}

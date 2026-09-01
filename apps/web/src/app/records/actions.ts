"use server";

import { eq, sql, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { colourway, design, location, movement } from "@slk/db";
import { designCode, designName } from "@slk/domain";

import { db } from "@/lib/db";
import {
  ATTRIBUTES,
  ATTRIBUTE_KEYS,
  HOME_INDUSTRY,
  type AttributeKey,
} from "@/lib/attributes";
import { MOVEMENT_KINDS, type MovementDraft } from "@/lib/movements";

export interface ActionResult {
  ok: boolean;
  message: string;
  /** Field key → what is wrong with it, so the editor can point at a tab. */
  errors?: Record<string, string>;
  /** A record the caller should open next — see copyRecord. */
  colourwayId?: string;
}

/** Everything the editor can change, as it arrives from the form. */
export interface RecordDraft {
  colourwayId?: string;
  attributes: Partial<Record<AttributeKey, string | null>>;

  /**
   * The adjectives. A set rather than one id, and the only attribute that is.
   *
   * Stored in design_descriptor rather than on the design, so this is applied
   * separately from the column writes and replaced wholesale — the form sends
   * what the design should carry, not a diff.
   */
  descriptors: string[];
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

  /**
   * The image slots this product should have, as lookup value ids.
   *
   * A slot with a photograph in it is never removed by this — un-ticking a
   * filled slot would be deleting a photograph by implication, and the form
   * does not offer it.
   */
  imageSlots: string[];

  notes: string;
  name: string;
  nameIsCustom: boolean;
}

const REQUIRED: { key: string; label: string }[] = [
  { key: "industry", label: "Industry" },
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

async function validate(draft: RecordDraft): Promise<Record<string, string>> {
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

  // Which product type is required depends on the industry, so it is checked
  // here rather than sitting in REQUIRED. Re-read from the database rather
  // than trusted from the client: a Server Action is reachable by POST
  // whether or not the form rendered the field.
  const industryId = draft.attributes.industry;
  const industry =
    industryId == null || industryId === ""
      ? null
      : ((await labelsFor([industryId])).get(industryId) ?? null);

  const isHome = industry === HOME_INDUSTRY;
  const key = isHome ? "homeProductType" : "productType";

  if (!draft.attributes[key]) {
    errors[key] = "Product type is needed";
  }

  // The other industry's fields have no meaning on this record. Refused
  // rather than quietly dropped, because a record carrying both a Saree and a
  // Bedsheets product type is a record nobody can explain later.
  const foreign: AttributeKey[] = isHome
    ? ["productType", "garmentType"]
    : ["homeProductType", "homeWeavingCategory"];

  for (const other of foreign) {
    if (draft.attributes[other]) {
      errors[other] = `Not applicable to ${industry ?? "this industry"}`;
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
  const errors = await validate(draft);

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
    ...draft.descriptors,
    draft.colourId,
  ]);

  const label = (key: AttributeKey) => {
    const id = draft.attributes[key];
    return id ? (labels.get(id) ?? null) : null;
  };

  // The name is composed unless somebody has typed over it.
  const composed = designName({
    descriptors: draft.descriptors.map((id) => labels.get(id) ?? null),
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

    await setDescriptors(tx, cw.designId, draft.descriptors);
  });

  await setImageSlots(cw.id, draft.imageSlots);

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
    message: "Copied. Choose its colour.",
    // The copy exists precisely to become a different colour, and it is not a
    // usable record until it has one — it shows in the table as a blank
    // swatch and a dash. Handing the id back lets the caller open it straight
    // away rather than leaving someone to find the row and work out that the
    // colour is set somewhere else.
    colourwayId: made?.id,
  };
}

/** A brand-new design, minted with the next sequence number. */
export async function createRecord(draft: RecordDraft): Promise<ActionResult> {
  const errors = await validate(draft);

  if (Object.keys(errors).length > 0) {
    return { ok: false, message: "Some fields still need attention.", errors };
  }

  const labels = await labelsFor([
    ...ATTRIBUTE_KEYS.map((k) => draft.attributes[k]),
    ...draft.descriptors,
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
    descriptors: draft.descriptors.map((id) => labels.get(id) ?? null),
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

  await setDescriptors(db, created.id, draft.descriptors);

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

  if (cw !== undefined) await setImageSlots(cw.id, draft.imageSlots);

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

  // Each line is its own consignment, because each is a separate quantity
  // landing in a separate place — which is exactly what a product code
  // identifies.
  const codes: string[] = [];

  for (const line of usable) {
    const consignment = await openConsignment(
      db,
      colourwayId,
      line.qty,
      line.locationId,
      null,
      "Opening stock",
    );

    codes.push(consignment.code);

    await db.insert(movement).values({
      colourwayId,
      batchId: consignment.id,
      qty: line.qty,
      kind: "received",
      fromLocationId: source.id,
      toLocationId: line.locationId,
      occurredAt: new Date(),
      reason: "Opening stock",
    });
  }

  const total = usable.reduce((sum, line) => sum + line.qty, 0);

  const where =
    usable.length === 1
      ? `into ${byId.get(usable[0]!.locationId)?.name}`
      : `across ${usable.length} locations`;

  return `${total} ${where} — product ${codes.join(", ")}.`;
}

/**
 * The fields a row can be changed on directly, without opening the editor.
 *
 * Only lookup-backed ones, and only those where a single choice is the whole
 * change. Name and design code are composed or frozen; quantity comes from
 * the ledger; prices are numbers, not choices.
 *
 * Whitelisted rather than derived, because this is what a Server Action will
 * accept from a POST — an open mapping from column name to database column is
 * how a fast edit becomes an arbitrary write.
 */
const INLINE_FIELDS = {
  productType: "productType",
  homeProductType: "homeProductType",
  subType: "garmentType",
  productionMethod: "productionMethod",
  fibreType: "fibreType",
  craftTechnique: "craftTechnique",
  audienceType: "audienceType",
  weaveStructure: "weaveStructure",
  textileMaterial: "textileMaterial",
  craftSubType: "craftSubType",
  motifCategory: "motifCategory",
  motif: "motif",
  borderHeight: "borderHeight",
  palluDesign: "palluDesign",
  blouseAvailable: "blouseAvailable",
  descriptor: "descriptor",
} as const satisfies Record<string, AttributeKey>;

export type InlineField = keyof typeof INLINE_FIELDS | "colour";

/**
 * Changes one lookup-backed field on one row.
 *
 * The point is not opening a six-tab dialog to change Saree to Dupatta. It
 * writes through the same columns the editor does and enforces the same
 * rules, because a faster path must not be a laxer one:
 *
 *   - the value has to belong to that field's list, and be Active. A retired
 *     value stays readable on the records that carry it and stops being
 *     choosable, which is the whole distinction.
 *   - a product type has to match the record's industry.
 *   - the composed name is rebuilt, unless someone has typed over it.
 *
 * Attributes live on the design, so changing one reaches every colour under
 * it. The result says so rather than letting it be a surprise.
 */
export async function setRecordField(
  colourwayId: string,
  field: InlineField,
  valueId: string | null,
): Promise<ActionResult> {
  const [row] = await db.execute<{
    designId: string;
    nameIsCustom: boolean;
    industry: string | null;
    siblings: number;
  }>(sql`
    select
      d.id as "designId", d.name_is_custom as "nameIsCustom",
      industry.label as industry,
      (select count(*)::int from colourway s where s.design_id = d.id) as siblings
    from colourway cw
    join design d on d.id = cw.design_id
    left join lookup_value industry on industry.id = d.industry_id
    where cw.id = ${colourwayId}
  `);

  if (row === undefined) {
    return { ok: false, message: "That record no longer exists." };
  }

  if (field === "colour") return setColour(colourwayId, row.designId, valueId);

  const key = INLINE_FIELDS[field];
  if (key === undefined) {
    return { ok: false, message: "That field cannot be changed here." };
  }

  // Industry decides which product type list applies, so the wrong one is
  // refused rather than silently written into a column nothing reads.
  const isHome = row.industry === HOME_INDUSTRY;

  if (field === "productType" && isHome) {
    return {
      ok: false,
      message: "This is a Home & Lifestyle record. Open it to change its product type.",
    };
  }
  if (field === "homeProductType" && !isHome) {
    return {
      ok: false,
      message: "This is a Clothing record. Open it to change its product type.",
    };
  }

  if (valueId !== null) {
    const [value] = await db.execute<{
      label: string;
      list: string;
      status: string;
    }>(sql`
      select v.label, l.code as list, v.status
      from lookup_value v join lookup_list l on l.id = v.list_id
      where v.id = ${valueId}
    `);

    if (value === undefined) return { ok: false, message: "No such value." };

    if (value.list !== ATTRIBUTES[key].list) {
      return {
        ok: false,
        message: `"${value.label}" does not belong to ${ATTRIBUTES[key].label}.`,
      };
    }

    if (value.status !== "active") {
      return {
        ok: false,
        message: `"${value.label}" is ${value.status} and cannot be chosen. Records already using it keep it.`,
      };
    }
  }

  await db.execute(sql`
    update design
    set ${sql.identifier(ATTRIBUTES[key].column)} = ${valueId},
        updated_at = now()
    where id = ${row.designId}
  `);

  // Unit of measure follows product type, and leaving it behind would price a
  // length of cloth per piece.
  if (field === "productType" || field === "homeProductType") {
    await db.execute(sql`
      update design
      set uom_id = (select v.parent_value_id from lookup_value v where v.id = ${valueId})
      where id = ${row.designId}
    `);
  }

  await recomposeName(row.designId, row.nameIsCustom);

  revalidatePath("/records");

  const spread =
    row.siblings > 1
      ? ` Applied to all ${row.siblings} colours of this design.`
      : "";

  return { ok: true, message: `Saved.${spread}` };
}

async function setColour(
  colourwayId: string,
  designId: string,
  valueId: string | null,
): Promise<ActionResult> {
  if (valueId !== null) {
    const [value] = await db.execute<{
      label: string;
      list: string;
      status: string;
    }>(sql`
      select v.label, l.code as list, v.status
      from lookup_value v join lookup_list l on l.id = v.list_id
      where v.id = ${valueId}
    `);

    if (value === undefined) return { ok: false, message: "No such value." };

    if (value.list !== "colour") {
      return { ok: false, message: `"${value.label}" is not a colour.` };
    }

    if (value.status !== "active") {
      return {
        ok: false,
        message: `"${value.label}" is ${value.status} and cannot be chosen.`,
      };
    }

    // One colour per design. Without this the unique index refuses it with a
    // constraint name rather than a sentence.
    const [clash] = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from colourway
      where design_id = ${designId}
        and colour_id = ${valueId}
        and id <> ${colourwayId}
    `);

    if ((clash?.n ?? 0) > 0) {
      return {
        ok: false,
        message: `This design already has a ${value.label} colourway.`,
      };
    }
  }

  await db
    .update(colourway)
    .set({ colourId: valueId, updatedAt: new Date() })
    .where(eq(colourway.id, colourwayId));

  revalidatePath("/records");

  return { ok: true, message: "Saved." };
}

/** Rebuilds the composed name after an attribute changes. */
async function recomposeName(
  designId: string,
  nameIsCustom: boolean,
): Promise<void> {
  if (nameIsCustom) return;

  const [d] = await db.execute<Record<string, string | null>>(sql`
    select
      (
        select string_agg(dv.label, char(31) order by dv.sort_order, dv.label)
        from design_descriptor dd
        join lookup_value dv on dv.id = dd.descriptor_id
        where dd.design_id = d.id
      ) as descriptors,
      craft.label as craft, region.label as region,
      silk.label as silk, cotton.label as cotton, fibre.label as fibre,
      garment.label as garment,
      coalesce(pt.label, hpt.label) as "productType"
    from design d
    left join lookup_value craft      on craft.id      = d.craft_technique_id
    left join lookup_value region     on region.id     = d.regional_style_id
    left join lookup_value silk       on silk.id       = d.silk_sub_family_id
    left join lookup_value cotton     on cotton.id     = d.cotton_sub_family_id
    left join lookup_value fibre      on fibre.id      = d.fibre_type_id
    left join lookup_value garment    on garment.id    = d.garment_type_id
    left join lookup_value pt         on pt.id         = d.product_type_id
    left join lookup_value hpt        on hpt.id        = d.home_product_type_id
    where d.id = ${designId}
  `);

  if (d === undefined) return;

  const name = designName({
    // Aggregated in the query with a separator no label can contain,
    // because a design can carry several and they compose in list order.
    descriptors: (d["descriptors"] ?? "").split("").filter(Boolean),
    craftTechnique: d["craft"] ?? null,
    regionalStyle: d["region"] ?? null,
    silkSubFamily: d["silk"] ?? null,
    cottonSubFamily: d["cotton"] ?? null,
    fibreType: d["fibre"] ?? null,
    garmentType: d["garment"] ?? null,
    productType: d["productType"] ?? null,
  });

  await db.execute(sql`update design set name = ${name} where id = ${designId}`);
}


/**
 * Appends one movement to the ledger.
 *
 * Never an update, never a delete, and never a stored total: what is on hand
 * is the sum of what has been recorded, so a count can always be explained by
 * the events that produced it. The database enforces the same thing —
 * `movement` refuses UPDATE and DELETE outright.
 *
 * This is what "receive stock against a location" needed and did not have.
 * Before it, stock could only arrive when the record was created, and the
 * only later adjustment was a single number with no location on it.
 */
export async function recordMovement(
  colourwayId: string,
  draft: MovementDraft,
): Promise<ActionResult> {
  const spec = MOVEMENT_KINDS[draft.kind];
  if (spec === undefined) return { ok: false, message: "Unknown kind of movement." };

  const qty = Math.round(Number(draft.qty));
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, message: "How many? It has to be a number above zero." };
  }

  const [cw] = await db
    .select({ id: colourway.id, designId: colourway.designId })
    .from(colourway)
    .where(eq(colourway.id, colourwayId));

  if (cw === undefined) return { ok: false, message: "That record no longer exists." };

  /*
    Serialised designs used to be refused here, on the grounds that their
    count is the number of tagged pieces and stock should move by scanning
    one. That was true when nothing could mint a piece — but receiving is now
    exactly what mints them, so refusing a receipt meant a saree could never
    acquire the pieces the rule was protecting.

    Receiving a serialised design mints one piece per unit, each with its own
    item code, alongside the movement. The two agree because they are written
    together.

    Sending one out is still by quantity rather than by scan, which is a
    smaller compromise: the count stays right, but which specific saree left
    is not recorded. That wants the scanning flow, and until it exists,
    refusing would mean serialised stock could arrive and never leave.
  */

  const locations = await db.select().from(location);
  const byId = new Map(locations.map((l) => [l.id, l]));
  const byCode = new Map(locations.map((l) => [l.code, l]));

  const picked = byId.get(draft.locationId);
  if (picked === undefined) return { ok: false, message: "Choose a location." };

  let from: string;
  let to: string;

  if (draft.kind === "transferred") {
    const destination = byId.get(draft.toLocationId ?? "");

    if (destination === undefined) return { ok: false, message: "Choose where it is going." };
    if (destination.id === picked.id) {
      // The ledger refuses this too — a movement to where it already is
      // records nothing — but a constraint name is not an explanation.
      return { ok: false, message: "That is the same location twice." };
    }

    from = picked.id;
    to = destination.id;
  } else {
    const counterpart = spec.other === null ? undefined : byCode.get(spec.other);

    if (counterpart === undefined) {
      return {
        ok: false,
        message: `No ${spec.other} location is set up. Add one on Locations.`,
      };
    }

    from = spec.dir === "in" ? counterpart.id : picked.id;
    to = spec.dir === "in" ? picked.id : counterpart.id;
  }

  // You cannot send out what is not there. Checked per location rather than
  // in total, because "we have twelve" is no help when all twelve are in the
  // warehouse and the shop is trying to sell one.
  if (spec.dir === "out") {
    const [held] = await db.execute<{ qty: number }>(sql`
      select (
        coalesce((select sum(m.qty)::int from movement m
                  where m.colourway_id = ${colourwayId} and m.to_location_id = ${from}), 0)
      - coalesce((select sum(m.qty)::int from movement m
                  where m.colourway_id = ${colourwayId} and m.from_location_id = ${from}), 0)
      ) as qty
    `);

    const available = held?.qty ?? 0;

    if (qty > available) {
      return {
        ok: false,
        message:
          available === 0
            ? `There is nothing at ${byId.get(from)?.name} to move.`
            : `Only ${available} at ${byId.get(from)?.name}.`,
      };
    }
  }

  const reference = draft.reference.trim() === "" ? null : draft.reference.trim();
  const note = draft.note.trim() === "" ? null : draft.note.trim();

  // Receiving opens a consignment; everything else moves stock that already
  // exists. Selling does not mint a product code, and neither does a
  // transfer — the saree keeps the codes it arrived with.
  const consignment =
    draft.kind === "received"
      ? await openConsignment(db, colourwayId, qty, to, reference, note)
      : null;

  await db.insert(movement).values({
    colourwayId,
    batchId: consignment?.id ?? null,
    qty,
    kind: draft.kind,
    fromLocationId: from,
    toLocationId: to,
    occurredAt: new Date(),
    reference,
    note,
  });

  revalidatePath("/records");

  const where =
    draft.kind === "transferred"
      ? `${byId.get(from)?.name} → ${byId.get(to)?.name}`
      : spec.dir === "in"
        ? `into ${byId.get(to)?.name}`
        : `out of ${byId.get(from)?.name}`;

  return {
    ok: true,
    message:
      consignment === null
        ? `${spec.label} ${qty} ${where}.`
        : `${spec.label} ${qty} ${where} — product ${consignment.code}` +
          (consignment.items.length > 0
            ? `, items ${consignment.items[0]}–${consignment.items.at(-1)}.`
            : "."),
  };
}


/* ----------------------------------------------------------------- codes */

/**
 * A consignment: one product code, and one item code per piece.
 *
 * Called wherever stock arrives — the opening quantities on a new record, and
 * Received on the Stock tab. Both are the same event, so both mint the same
 * things.
 *
 * The codes come from Postgres sequences rather than from `max(code) + 1`.
 * Two people receiving at once would both read the same maximum and both try
 * to write it; a sequence hands out a number to one caller at a time and
 * never repeats, which is what a code printed on a label needs.
 */
async function openConsignment(
  tx: typeof db,
  colourwayId: string,
  qty: number,
  locationId: string,
  reference: string | null,
  note: string | null,
): Promise<{ id: string; code: string; items: string[] }> {
  const [batch] = await tx.execute<{ id: string; code: string }>(sql`
    insert into batch (colourway_id, code, qty, location_id, reference, note)
    values (
      ${colourwayId},
      nextval('product_code_seq')::text,
      ${qty}, ${locationId}, ${reference}, ${note}
    )
    returning id, code
  `);

  if (batch === undefined) {
    throw new Error("could not open a consignment");
  }

  // Item codes only for designs tagged piece by piece. For everything else a
  // quantity is the whole truth and minting rows to represent identical
  // metres of cloth would be inventing distinctions that do not exist.
  const [design] = await tx.execute<{ isSerialised: boolean }>(sql`
    select d.is_serialised as "isSerialised"
    from colourway cw join design d on d.id = cw.design_id
    where cw.id = ${colourwayId}
  `);

  if (design?.isSerialised !== true) {
    return { id: batch.id, code: batch.code, items: [] };
  }

  const [next] = await tx.execute<{ max: number }>(sql`
    select coalesce(max(serial), 0)::int as max from piece
    where colourway_id = ${colourwayId}
  `);

  const items = await tx.execute<{ code: string }>(sql`
    insert into piece (colourway_id, batch_id, code, serial)
    select
      ${colourwayId},
      ${batch.id},
      nextval('item_code_seq')::text,
      ${next?.max ?? 0} + g
    from generate_series(1, ${qty}) as g
    returning code
  `);

  return { id: batch.id, code: batch.code, items: items.map((i) => i.code) };
}


/**
 * Replaces the adjectives on a design with exactly what was sent.
 *
 * Wholesale rather than a diff: the form knows the whole answer, and working
 * out what changed only to apply it in two statements would be the same two
 * statements with a chance of disagreeing with the screen.
 *
 * Ids are checked against the Descriptor list before anything is written. A
 * Server Action is reachable by POST, and without this any lookup value at
 * all — a colour, a motif — could be filed as an adjective.
 */
async function setDescriptors(
  // Structural, so the same function works inside a transaction and outside
  // one: a PgTransaction is not a PostgresJsDatabase, and both can execute.
  tx: { execute: (query: SQL) => Promise<unknown> },
  designId: string,
  ids: string[],
): Promise<void> {
  const wanted = [...new Set(ids)];

  await tx.execute(
    sql`delete from design_descriptor where design_id = ${designId}`,
  );

  if (wanted.length === 0) return;

  await tx.execute(sql`
    insert into design_descriptor (design_id, descriptor_id)
    select ${designId}, v.id
    from lookup_value v
    join lookup_list l on l.id = v.list_id
    where l.code = 'descriptor'
      and v.status = 'active'
      and v.id in (${sql.join(
        wanted.map((id) => sql`${id}`),
        sql`, `,
      )})
    on conflict do nothing
  `);
}

/**
 * Records which photographs a product should have.
 *
 * Adds the newly ticked, removes the un-ticked — but never one that has a
 * file against it. Un-ticking a filled slot would delete a photograph by
 * implication, and a checkbox should not be able to mean that. The form does
 * not offer it either; this is the same rule kept on the side that a POST
 * cannot get around.
 */
async function setImageSlots(
  colourwayId: string,
  chosen: string[],
): Promise<void> {
  const wanted = [...new Set(chosen.filter((id) => id !== ""))];

  const existing = await db.execute<{ slotId: string; hasFile: boolean }>(sql`
    select slot_id as "slotId", (storage_key is not null) as "hasFile"
    from image where colourway_id = ${colourwayId} and slot_id is not null
  `);

  const have = new Set(existing.map((e) => e.slotId));
  const filled = new Set(existing.filter((e) => e.hasFile).map((e) => e.slotId));

  const toAdd = wanted.filter((id) => !have.has(id));
  const toDrop = existing
    .filter((e) => !wanted.includes(e.slotId) && !filled.has(e.slotId))
    .map((e) => e.slotId);

  if (toAdd.length > 0) {
    // Only values from the image slot list. A Server Action takes whatever is
    // POSTed to it, and an unchecked id here would let any lookup value —
    // a colour, a motif — be filed as a photograph.
    const valid = await db.execute<{ id: string }>(sql`
      select v.id from lookup_value v
      join lookup_list l on l.id = v.list_id
      where l.code = 'image_slot' and v.status = 'active'
        and v.id in (${sql.join(toAdd.map((id) => sql`${id}`), sql`, `)})
    `);

    if (valid.length > 0) {
      await db.execute(sql`
        insert into image (colourway_id, slot_id, sort_order)
        values ${sql.join(
          valid.map((v, i) => sql`(${colourwayId}, ${v.id}, ${i})`),
          sql`, `,
        )}
        on conflict (colourway_id, slot_id) do nothing
      `);
    }
  }

  if (toDrop.length > 0) {
    await db.execute(sql`
      delete from image
      where colourway_id = ${colourwayId}
        and storage_key is null
        and slot_id in (${sql.join(toDrop.map((id) => sql`${id}`), sql`, `)})
    `);
  }
}

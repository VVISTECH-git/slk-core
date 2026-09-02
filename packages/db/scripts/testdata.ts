import { config } from "dotenv";
import postgres from "postgres";
import { resolve } from "node:path";

import { designCode, designName } from "@slk/domain";

config({ path: resolve(process.cwd(), "../../.env") });

/**
 * Empties the catalogue and fills it with sarees that between them exercise
 * every branch the record editor has.
 *
 *   pnpm db:testdata
 *
 * The point is not volume. It is that every conditional path in the form has
 * at least one record standing on it, so a regression shows up as a record
 * that reads wrong rather than as a code path nobody happened to open:
 *
 *   sub type      With Blouse and Without Blouse
 *   fibre         Silk, Cotton, and a fibre that names no materials of its
 *                 own, which falls through to the ten shared ones
 *   saree style   all five
 *   blouse        every status, both styles, every material
 *   motifs        body, pallu, border and blouse, set and unset
 *   descriptors   none, one, several — the name composes from all of them
 *   colours       primary alone, and primary with a secondary
 *   prices        all five with paise, and retail only
 *   naming        composed, and typed over
 *   siblings      one design carrying three colours
 *
 * Every colourway receives two pieces into the main internal warehouse, as
 * one consignment, exactly as the form would write it.
 *
 * Refuses to run against anything but localhost. It deletes a catalogue.
 */

const url = process.env["DATABASE_URL"] ?? "";

if (!/localhost|127\.0\.0\.1/.test(url)) {
  const host = url.replace(/^.*@/, "").replace(/[/?].*$/, "");
  console.error(
    `\n  Refusing to run against ${host || "an unset DATABASE_URL"}.\n` +
      `  This deletes every product and item, and only a local database is fair game.\n`,
  );
  process.exit(1);
}

const sql = postgres(url);

/* ------------------------------------------------------------ vocabulary */

interface Value {
  id: string;
  label: string;
  parentId: string | null;
  soldById: string | null;
}

const vocab = new Map<string, Value[]>();

for (const row of await sql<
  { code: string; id: string; label: string; parent: string | null; soldBy: string | null }[]
>`
  select l.code, v.id, v.label,
         v.parent_value_id as parent, v.sold_by_id as "soldBy"
  from lookup_value v join lookup_list l on l.id = v.list_id
  where v.status = 'active'
  order by l.code, v.sort_order, v.label
`) {
  const list = vocab.get(row.code) ?? [];
  list.push({ id: row.id, label: row.label, parentId: row.parent, soldById: row.soldBy });
  vocab.set(row.code, list);
}

/** One value by name. Throws rather than writing a record with a hole in it. */
function value(list: string, label: string): Value {
  const found = vocab.get(list)?.find((v) => v.label === label);
  if (found === undefined) {
    throw new Error(`no "${label}" in ${list} — the vocabulary has moved`);
  }
  return found;
}

/**
 * Every value in one list whose parent is a named value in another.
 *
 * Both lists are named, because a label is not unique across the vocabulary:
 * Silk and Cotton are fibres and they are also blouse materials, and looking
 * up the parent by label alone found the blouse ones and quietly returned an
 * empty list.
 */
function under(list: string, parentList: string, parentLabel: string): Value[] {
  const parent = value(parentList, parentLabel);
  return (vocab.get(list) ?? []).filter((v) => v.parentId === parent.id);
}

/** The values in a list that name no parent — offered whatever is chosen above. */
function unparented(list: string): Value[] {
  return (vocab.get(list) ?? []).filter((v) => v.parentId === null);
}

const locations = await sql<
  { id: string; code: string; name: string; isInternal: boolean }[]
>`select id, code, name, is_internal as "isInternal" from location order by sort_order`;

const warehouse = locations.find((l) => l.isInternal);
const production = locations.find((l) => l.code === "PRODUCTION");

if (warehouse === undefined || production === undefined) {
  console.error("\n  No internal warehouse or no PRODUCTION location. Run the migrations first.\n");
  process.exit(1);
}

/* ---------------------------------------------------------------- purge */

const before = await sql`
  select
    (select count(*)::int from design)    as designs,
    (select count(*)::int from colourway) as colourways,
    (select count(*)::int from piece)     as pieces,
    (select count(*)::int from movement)  as movements
`;

console.log("Before:");
console.table(before);

await sql.begin(async (tx) => {
  // The ledger refuses UPDATE and DELETE by trigger — that is what makes a
  // count explicable. Rebuilding a test catalogue is a deliberate exception,
  // lifted and put back inside one transaction rather than left off.
  await tx`ALTER TABLE movement DISABLE TRIGGER movement_no_change`;
  await tx`DELETE FROM movement`;
  await tx`DELETE FROM piece`;
  await tx`DELETE FROM batch`;
  await tx`DELETE FROM image`;
  await tx`DELETE FROM design_descriptor`;
  await tx`DELETE FROM colourway`;
  await tx`DELETE FROM design`;
  await tx`ALTER TABLE movement ENABLE TRIGGER movement_no_change`;
});

/* ----------------------------------------------------------- the matrix */

const saree = value("product_type", "Saree");
const clothing = value("industry", "Clothing");
const withBlouse = value("garment_type", "With Blouse");
const withoutBlouse = value("garment_type", "Without Blouse");
const kalamkari = value("craft_technique", "Kalamkari");
const plainWeave = value("weave_structure", "Plain Weave");
const women = value("audience_type", "Women");

const silk = value("fibre_type", "Silk");
const cotton = value("fibre_type", "Cotton");
/** A fibre with no materials of its own, so the shared ten are offered. */
const linen = value("fibre_type", "Linen");

const silkMaterials = under("textile_material", "fibre_type", "Silk");
const cottonMaterials = under("textile_material", "fibre_type", "Cotton");
const sharedMaterials = unparented("textile_material");

const styles = vocab.get("saree_style") ?? [];
const borderStyles = vocab.get("border_style") ?? [];
const borderHeights = vocab.get("border_height") ?? [];
const blouseStatuses = vocab.get("blouse_status") ?? [];
const blouseStyles = vocab.get("blouse_style") ?? [];
const blouseMaterials = vocab.get("blouse_material") ?? [];
const motifCategories = vocab.get("motif_category") ?? [];
const motifs = vocab.get("motif") ?? [];
const descriptors = vocab.get("descriptor") ?? [];
const colours = vocab.get("colour") ?? [];
const methods = vocab.get("production_method") ?? [];

/** Steps through a list so successive records differ without being random. */
function cycle<T>(items: T[], i: number): T | undefined {
  return items.length === 0 ? undefined : items[i % items.length];
}

interface Spec {
  what: string;
  fibre: Value;
  material?: Value | undefined;
  subType: Value;
  style?: Value | undefined;
  colours: string[];
  secondary?: Value | undefined;
  descriptorCount: number;
  prices: { cost?: string; making?: string; wholesale?: string; retail: string; mrp?: string };
  customName?: string | undefined;
  notes?: string | undefined;
  withMotifs: boolean;
  blouseStatus?: Value | undefined;
  blouseStyle?: Value | undefined;
  blouseMaterial?: Value | undefined;
}

const specs: Spec[] = [];

// One per saree style, alternating fibre and sub type, so style × fibre ×
// blouse is covered without writing the cross product out longhand.
styles.forEach((style, i) => {
  const isSilk = i % 3 === 0;
  const isCotton = i % 3 === 1;
  const fibre = isSilk ? silk : isCotton ? cotton : linen;
  const pool = isSilk ? silkMaterials : isCotton ? cottonMaterials : sharedMaterials;

  specs.push({
    what: `${style.label} — ${fibre.label}`,
    fibre,
    material: cycle(pool, i),
    subType: i % 2 === 0 ? withBlouse : withoutBlouse,
    style,
    colours: [cycle(colours, i * 7)?.label ?? "Red"],
    secondary: i % 2 === 0 ? cycle(colours, i * 7 + 3) : undefined,
    descriptorCount: i % 4,
    prices:
      i % 2 === 0
        ? {
            cost: String(1200 + i * 50),
            making: "350.50",
            wholesale: String(2100 + i * 40),
            retail: String(3499.99 + i),
            mrp: String(3999 + i * 10),
          }
        : { retail: String(2750 + i * 25) },
    customName: i === 2 ? "Madam's Special Half Saree" : undefined,
    notes: i === 1 ? "Second in the Pedana run; check the pallu dye lot." : undefined,
    withMotifs: i % 2 === 0,
    blouseStatus: cycle(blouseStatuses, i),
    blouseStyle: cycle(blouseStyles, i),
    blouseMaterial: cycle(blouseMaterials, i),
  });
});

// A design carrying three colours, so siblings and "one row per colour" are
// standing on something.
specs.push({
  what: "three colourways under one design",
  fibre: silk,
  material: silkMaterials[0],
  subType: withBlouse,
  style: styles[0],
  colours: ["Maroon", "Navy", "Bottle Green"].filter((c) =>
    colours.some((v) => v.label === c),
  ),
  descriptorCount: 2,
  prices: { cost: "1800", retail: "4999.50", mrp: "5499" },
  withMotifs: true,
  blouseStatus: blouseStatuses.find((s) => s.label === "Stitched"),
  blouseStyle: blouseStyles.find((s) => s.label === "Contrast"),
  blouseMaterial: blouseMaterials.find((s) => s.label === "Silk"),
});

// The bare minimum a record can be saved with: no style, no material, no
// motifs, no descriptors, one price.
specs.push({
  what: "the least a saree can say",
  fibre: linen,
  subType: withoutBlouse,
  colours: ["White"].filter((c) => colours.some((v) => v.label === c)),
  descriptorCount: 0,
  prices: { retail: "999" },
  withMotifs: false,
});

/* ------------------------------------------------------------- creation */

let created = 0;
let pieces = 0;

for (const [i, spec] of specs.entries()) {
  const method = cycle(methods, i);
  const category = spec.withMotifs ? cycle(motifCategories, i) : undefined;
  const motif = category
    ? motifs.find((m) => m.parentId === category.id)
    : undefined;

  const chosenDescriptors = descriptors.slice(0, spec.descriptorCount);

  const [highest] = await sql<{ max: number }[]>`
    select coalesce(max(seq), 0)::int as max from design
  `;
  const seq = (highest?.max ?? 0) + 1;

  const code = designCode({
    productType: saree.label,
    regionalStyle: null,
    fibreType: spec.fibre.label,
    seq,
  });

  const composed = designName({
    descriptors: chosenDescriptors.map((d) => d.label),
    craftTechnique: kalamkari.label,
    fibreType: spec.fibre.label,
    productType: saree.label,
  });

  const isBlouse = spec.subType.id === withBlouse.id;

  const [design] = await sql<{ id: string }[]>`
    insert into design (
      code, seq, name, name_is_custom, is_serialised, notes,
      industry_id, product_type_id, garment_type_id, uom_id,
      production_method_id, audience_type_id,
      fibre_type_id, weave_structure_id, textile_material_id,
      craft_technique_id, saree_style_id,
      border_style_id, border_height_id,
      motif_category_id, motif_id,
      saree_body_motif_id, pallu_motif_id, border_motif_id, blouse_motif_id,
      blouse_available_id, blouse_status_id, blouse_style_id,
      blouse_material_id, blouse_border_id
    ) values (
      ${code}, ${seq}, ${spec.customName ?? composed}, ${spec.customName != null},
      true, ${spec.notes ?? null},
      ${clothing.id}, ${saree.id}, ${spec.subType.id}, ${saree.soldById},
      ${method?.id ?? null}, ${women.id},
      ${spec.fibre.id}, ${plainWeave.id}, ${spec.material?.id ?? null},
      ${kalamkari.id}, ${spec.style?.id ?? null},
      ${cycle(borderStyles, i)?.id ?? null}, ${cycle(borderHeights, i)?.id ?? null},
      ${category?.id ?? null}, ${motif?.id ?? null},
      ${motif?.id ?? null}, ${spec.withMotifs ? (cycle(motifs, i + 1)?.id ?? null) : null},
      ${spec.withMotifs ? (cycle(motifs, i + 2)?.id ?? null) : null},
      ${isBlouse && spec.withMotifs ? (cycle(motifs, i + 3)?.id ?? null) : null},
      ${value("blouse_available", isBlouse ? "Yes" : "No").id},
      ${isBlouse ? (spec.blouseStatus?.id ?? null) : (value("blouse_status", "Not Applicable").id)},
      ${isBlouse ? (spec.blouseStyle?.id ?? null) : null},
      ${isBlouse ? (spec.blouseMaterial?.id ?? null) : (value("blouse_material", "Not Applicable").id)},
      ${isBlouse ? (cycle(borderStyles, i + 1)?.id ?? null) : null}
    )
    returning id
  `;

  if (design === undefined) throw new Error("design not created");

  for (const d of chosenDescriptors) {
    await sql`
      insert into design_descriptor (design_id, descriptor_id)
      values (${design.id}, ${d.id}) on conflict do nothing
    `;
  }

  for (const colourName of spec.colours) {
    const colour = colours.find((c) => c.label === colourName);

    const [cw] = await sql<{ id: string }[]>`
      insert into colourway (
        design_id, colour_id, secondary_colour_id,
        cost_minor, making_minor, wholesale_minor, retail_minor, mrp_minor
      ) values (
        ${design.id}, ${colour?.id ?? null}, ${spec.secondary?.id ?? null},
        ${minor(spec.prices.cost)}, ${minor(spec.prices.making)},
        ${minor(spec.prices.wholesale)}, ${minor(spec.prices.retail)},
        ${minor(spec.prices.mrp)}
      )
      returning id
    `;

    if (cw === undefined) throw new Error("colourway not created");
    created += 1;

    // Two pieces, as one consignment into the warehouse — the same shape the
    // form writes, product code and item codes included.
    const [batch] = await sql<{ id: string; code: string }[]>`
      insert into batch (colourway_id, code, qty, location_id, reference, note)
      values (
        ${cw.id}, nextval('product_code_seq')::text, 2,
        ${warehouse.id}, null, 'Opening stock'
      )
      returning id, code
    `;

    if (batch === undefined) throw new Error("consignment not opened");

    await sql`
      insert into piece (colourway_id, batch_id, code, serial)
      select ${cw.id}, ${batch.id}, nextval('item_code_seq')::text, g
      from generate_series(1, 2) as g
    `;
    pieces += 2;

    await sql`
      insert into movement (
        colourway_id, batch_id, kind, qty,
        from_location_id, to_location_id, occurred_at, reason
      ) values (
        ${cw.id}, ${batch.id}, 'received', 2,
        ${production.id}, ${warehouse.id}, now(), 'Opening stock'
      )
    `;
  }
}

function minor(rupees: string | undefined): number | null {
  if (rupees === undefined) return null;
  const n = Number(rupees);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

const after = await sql`
  select
    (select count(*)::int from design)    as designs,
    (select count(*)::int from colourway) as colourways,
    (select count(*)::int from piece)     as pieces,
    (select count(*)::int from batch)     as consignments,
    (select count(*)::int from movement)  as movements
`;

console.log(
  `\nCreated ${created} colourways across ${specs.length} designs, ${pieces} pieces in ${warehouse.name}:`,
);
console.table(after);

for (const spec of specs) console.log(`  · ${spec.what}`);

await sql.end();

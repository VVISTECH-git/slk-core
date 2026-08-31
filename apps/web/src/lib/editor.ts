import { asc, eq, sql } from "drizzle-orm";

import { lookupList, lookupValue } from "@slk/db";

import { db } from "@/lib/db";

/**
 * Which lookup list each editable attribute draws from, and which column on
 * `design` holds it.
 *
 * One table rather than three parallel ones: the editor, the validator and
 * the save all read from here, so a new attribute is a single line and cannot
 * be half-wired.
 */
export const ATTRIBUTES = {
  industry: { list: "industry", column: "industry_id", label: "Industry" },
  productType: { list: "product_type", column: "product_type_id", label: "Product type" },
  homeProductType: { list: "home_product_type", column: "home_product_type_id", label: "Product type" },
  garmentType: { list: "garment_type", column: "garment_type_id", label: "Product sub type" },
  homeWeavingCategory: { list: "home_weaving_category", column: "home_weaving_category_id", label: "Weaving category" },
  productionMethod: { list: "production_method", column: "production_method_id", label: "Production method" },
  audienceType: { list: "audience_type", column: "audience_type_id", label: "Audience" },
  descriptor: { list: "descriptor", column: "descriptor_id", label: "Descriptor" },
  fibreType: { list: "fibre_type", column: "fibre_type_id", label: "Fiber type" },
  weaveStructure: { list: "weave_structure", column: "weave_structure_id", label: "Weave structure" },
  silkSubFamily: { list: "silk_sub_family", column: "silk_sub_family_id", label: "Silk sub family" },
  cottonSubFamily: { list: "cotton_sub_family", column: "cotton_sub_family_id", label: "Cotton sub family" },
  fabricType: { list: "fabric_type", column: "fabric_type_id", label: "Fabric type" },
  craftTechnique: { list: "craft_technique", column: "craft_technique_id", label: "Craft technique" },
  craftSubType: { list: "craft_sub_type", column: "craft_sub_type_id", label: "Craft sub type" },
  regionalStyle: { list: "regional_style", column: "regional_style_id", label: "Region style" },
  motifCategory: { list: "motif_category", column: "motif_category_id", label: "Motif category" },
  motif: { list: "motif", column: "motif_id", label: "Motif" },
  borderStyle: { list: "border_style", column: "border_style_id", label: "Border style" },
  borderHeight: { list: "border_height", column: "border_height_id", label: "Border height" },
  sareeLayout: { list: "saree_layout", column: "saree_layout_id", label: "Saree layout" },
  palluDesign: { list: "pallu_design", column: "pallu_design_id", label: "Pallu design" },
  blouseAvailable: { list: "blouse_available", column: "blouse_available_id", label: "Blouse availability" },
  blouseStatus: { list: "blouse_status", column: "blouse_status_id", label: "Blouse status" },
  blouseMaterial: { list: "blouse_material", column: "blouse_material_id", label: "Blouse material" },
} as const;

export type AttributeKey = keyof typeof ATTRIBUTES;

export const ATTRIBUTE_KEYS = Object.keys(ATTRIBUTES) as AttributeKey[];

export interface Option {
  id: string;
  label: string;
  /** For motifs, the category they belong to — the list filters on it. */
  parentId: string | null;
  hex: string | null;
}

export type Options = Record<string, Option[]>;

/** Every active value, grouped by list code, in the workbook's order. */
export async function loadOptions(): Promise<Options> {
  const rows = await db
    .select({
      listCode: lookupList.code,
      id: lookupValue.id,
      label: lookupValue.label,
      parentId: lookupValue.parentValueId,
      meta: lookupValue.meta,
    })
    .from(lookupValue)
    .innerJoin(lookupList, eq(lookupList.id, lookupValue.listId))
    .where(eq(lookupValue.isActive, true))
    .orderBy(asc(lookupList.code), asc(lookupValue.sortOrder));

  const options: Options = {};

  for (const row of rows) {
    (options[row.listCode] ??= []).push({
      id: row.id,
      label: row.label,
      parentId: row.parentId,
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

export interface RecordDetail {
  id: string;
  designId: string;
  code: string;
  name: string;
  nameIsCustom: boolean;
  isSerialised: boolean;
  notes: string | null;
  colourId: string | null;
  costMinor: number | null;
  makingMinor: number | null;
  wholesaleMinor: number | null;
  retailMinor: number | null;
  mrpMinor: number | null;
  attributes: Partial<Record<AttributeKey, string | null>>;
  /** Every colour under this design — a change to attributes hits all of them. */
  siblings: { id: string; colour: string | null }[];
  stock: {
    onHand: number;
    received: number;
    sold: number;
    damaged: number;
    returned: number;
    adjusted: number;
    byLocation: { location: string; qty: number }[];
  };
  movements: {
    id: number;
    kind: string;
    qty: number;
    occurredAt: string;
    reason: string | null;
    from: string | null;
    to: string | null;
  }[];
}

export async function loadRecord(
  colourwayId: string,
): Promise<RecordDetail | null> {
  const selects = ATTRIBUTE_KEYS.map(
    (key) => sql`d.${sql.identifier(ATTRIBUTES[key].column)} as ${sql.identifier(key)}`,
  );

  const rows = await db.execute<Record<string, unknown>>(sql`
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
  `);

  const row = rows[0];
  if (row === undefined) return null;

  const attributes: Partial<Record<AttributeKey, string | null>> = {};
  for (const key of ATTRIBUTE_KEYS) {
    attributes[key] = (row[key] as string | null) ?? null;
  }

  const siblings = await db.execute<{ id: string; colour: string | null }>(sql`
    select cw.id, v.label as colour
    from colourway cw
    left join lookup_value v on v.id = cw.colour_id
    where cw.design_id = ${row["designId"] as string}
    order by v.sort_order
  `);

  // Every kind counted once, from the ledger. Nothing here is stored.
  const [totals] = await db.execute<{
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

  const byLocation = await db.execute<{ location: string; qty: number }>(sql`
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

  const movements = await db.execute<RecordDetail["movements"][number]>(sql`
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
    movements,
  };
}

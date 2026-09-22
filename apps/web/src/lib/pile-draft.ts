import { sql } from "drizzle-orm";

import { ATTRIBUTES, type AttributeKey } from "@/lib/attributes";
import { db } from "@/lib/db";
import {
  BALE_TYPE_TO_PRODUCT,
  FIELD_SHORT,
  fieldsThrough,
  laterOf,
  requiredThrough,
} from "@/lib/pile-fields";
import { STAGES, type Stage } from "@/lib/stages";

/**
 * What "Complete a pile" shows: the facts already known from the bale's
 * cloth item (read-only), the facts the pile's stages so far decide
 * (editable), and what's still missing. Once the pile has a colourway, the
 * current values come from the design itself rather than the cloth item —
 * the record is the truth from then on.
 */

export type PileField = {
  key: AttributeKey;
  label: string;
  /** The Master List the value is picked from. */
  list: string;
  valueId: string | null;
  valueLabel: string | null;
  required: boolean;
};

export type PileDraft = {
  pileId: string;
  pileCode: string;
  pileName: string;
  /** The furthest stage any of its Thaans has come back from. */
  stage: Stage;
  colourwayId: string | null;
  designCode: string | null;
  recordName: string | null;
  /** Known before anyone types: from the cloth item, or from the design once one exists. */
  inherited: { key: AttributeKey; label: string; valueLabel: string }[];
  /** Cm sizes carried into `design.extra` — the cloth item's, until the design has its own. */
  extra: { lengthCm: number | null; widthCm: number | null };
  colourId: string | null;
  colourLabel: string | null;
  secondaryColourId: string | null;
  secondaryColourLabel: string | null;
  /** The editable questions for this pile right now. */
  fields: PileField[];
  /** Short names of the required fields still empty — "motif", "craft". */
  needs: string[];
};

/** The cloth item a pile came from — the item of the bale most of its Thaans belong to. */
async function inheritedFromItem(pileId: string): Promise<{
  attributes: Partial<Record<AttributeKey, string>>;
  extra: { lengthCm: number | null; widthCm: number | null };
}> {
  const [row] = await db.execute<{
    baleType: string;
    hasBlouse: boolean | null;
    fibreTypeId: string | null;
    weaveStructureId: string | null;
    textileMaterialId: string | null;
    productionMethodId: string | null;
    audienceId: string | null;
    borderStyleId: string | null;
    borderHeightId: string | null;
    blouseStyleId: string | null;
    blouseMaterialId: string | null;
    sareeLengthCm: number | null;
    sareeWidthCm: number | null;
  }>(sql`
    select
      b.type                                   as "baleType",
      i.has_blouse                             as "hasBlouse",
      i.fibre_type_id                          as "fibreTypeId",
      i.weave_structure_id                     as "weaveStructureId",
      i.textile_material_id                    as "textileMaterialId",
      i.production_method_id                   as "productionMethodId",
      i.audience_id                            as "audienceId",
      i.border_style_id                        as "borderStyleId",
      i.border_height_id                       as "borderHeightId",
      i.blouse_style_id                        as "blouseStyleId",
      i.blouse_material_id                     as "blouseMaterialId",
      i.saree_length_cm::double precision      as "sareeLengthCm",
      i.saree_width_cm::double precision       as "sareeWidthCm"
    from thaan t
    join bale b on b.id = t.bale_id
    join cloth_item i on i.id = b.item_id
    where t.pile_id = ${pileId}
    group by b.type, i.id
    order by count(*) desc
    limit 1
  `);
  if (row === undefined) return { attributes: {}, extra: { lengthCm: null, widthCm: null } };

  const attributes: Partial<Record<AttributeKey, string>> = {};
  const put = (key: AttributeKey, id: string | null) => {
    if (id !== null) attributes[key] = id;
  };
  put("fibreType", row.fibreTypeId);
  put("weaveStructure", row.weaveStructureId);
  put("textileMaterial", row.textileMaterialId);
  put("productionMethod", row.productionMethodId);
  put("audienceType", row.audienceId);
  put("borderStyle", row.borderStyleId);
  put("borderHeight", row.borderHeightId);
  put("blouseStyle", row.blouseStyleId);
  put("blouseMaterial", row.blouseMaterialId);

  // Industry and product type, by label, through the bridge table.
  const bridge = BALE_TYPE_TO_PRODUCT[row.baleType];
  if (bridge !== undefined) {
    const wanted: [AttributeKey, string, string][] = [
      ["industry", "industry", bridge.industry],
      [bridge.list === "product_type" ? "productType" : "homeProductType", bridge.list, bridge.label],
    ];
    if (row.baleType === "Sarees" && row.hasBlouse !== null) {
      wanted.push(["garmentType", "garment_type", row.hasBlouse ? "With Blouse" : "Without Blouse"]);
    }
    for (const [key, list, label] of wanted) {
      const [v] = await db.execute<{ id: string }>(sql`
        select lv.id from lookup_value lv join lookup_list ll on ll.id = lv.list_id
        where ll.code = ${list} and lower(lv.label) = lower(${label}) and lv.status = 'active'
        limit 1
      `);
      if (v !== undefined) attributes[key] = v.id;
    }
  }

  return { attributes, extra: { lengthCm: row.sareeLengthCm, widthCm: row.sareeWidthCm } };
}

/** The inherited lookup ids by key — what `completePile` seeds a new record with. */
export async function inheritedAttributeIds(pileId: string): Promise<Partial<Record<AttributeKey, string>>> {
  return (await inheritedFromItem(pileId)).attributes;
}

/** The furthest stage any of the pile's Thaans has been received back from, never earlier than the stage it was made at. */
export async function pileStage(pileId: string, createdStage: string): Promise<Stage> {
  const rows = await db.execute<{ stage: string; through: string | null }>(sql`
    select h.stage, h.through_stage as "through"
    from handover h join thaan t on t.id = h.thaan_id
    where t.pile_id = ${pileId} and h.received_at is not null
  `);
  let stage = (STAGES.includes(createdStage as Stage) ? createdStage : "Print") as Stage;
  for (const r of rows) {
    for (const s of [r.stage, r.through]) {
      if (s !== null && STAGES.includes(s as Stage)) stage = laterOf(stage, s as Stage);
    }
  }
  return stage;
}

async function labelsOf(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const wanted = ids.filter((id): id is string => typeof id === "string" && id !== "");
  if (wanted.length === 0) return new Map();
  const rows = await db.execute<{ id: string; label: string }>(sql`
    select id, label from lookup_value where id = any(${"{" + wanted.join(",") + "}"}::uuid[])
  `);
  return new Map(rows.map((r) => [r.id, r.label]));
}

export async function loadPileDraft(pileId: string): Promise<PileDraft | null> {
  const [pile] = await db.execute<{
    id: string;
    code: string;
    name: string;
    createdStage: string;
    mainColourId: string | null;
    colourwayId: string | null;
  }>(sql`
    select id, code, name, created_stage as "createdStage", main_colour_id as "mainColourId", colourway_id as "colourwayId"
    from pile where id = ${pileId}
  `);
  if (pile === undefined) return null;

  const stage = await pileStage(pile.id, pile.createdStage);
  const editable = fieldsThrough(stage);
  const required = new Set(requiredThrough(stage));

  let current: Partial<Record<AttributeKey, string | null>>;
  let extra: { lengthCm: number | null; widthCm: number | null };
  let colourId: string | null;
  let secondaryColourId: string | null;
  let designCode: string | null = null;
  let recordName: string | null = null;

  if (pile.colourwayId === null) {
    const inherited = await inheritedFromItem(pile.id);
    current = inherited.attributes;
    extra = inherited.extra;
    colourId = pile.mainColourId;
    secondaryColourId = null;
  } else {
    const [d] = await db.execute<Record<string, string | null> & { extra: { lengthCm?: number | null; widthCm?: number | null } }>(sql`
      select d.*, d.code as "designCode", d.name as "designName", cw.colour_id as "cwColour", cw.secondary_colour_id as "cwSecondary"
      from colourway cw join design d on d.id = cw.design_id where cw.id = ${pile.colourwayId}
    `);
    if (d === undefined) return null;
    current = {};
    for (const key of Object.keys(ATTRIBUTES) as AttributeKey[]) {
      const v = d[ATTRIBUTES[key].column];
      if (typeof v === "string") current[key] = v;
    }
    extra = { lengthCm: d.extra?.lengthCm ?? null, widthCm: d.extra?.widthCm ?? null };
    colourId = d["cwColour"] ?? null;
    secondaryColourId = d["cwSecondary"] ?? null;
    designCode = d["designCode"] ?? null;
    recordName = d["designName"] ?? null;
  }

  // Anything the record can't be created without, and the item didn't fix, is asked for too.
  const mustHave: AttributeKey[] = ["fibreType", current.industry === undefined ? "productType" : (current.homeProductType !== undefined ? "homeProductType" : "productType")];
  for (const key of mustHave) {
    if (!editable.includes(key) && (current[key] === undefined || current[key] === null)) {
      editable.push(key);
      required.add(key);
    }
  }

  const labels = await labelsOf([
    ...Object.values(current),
    colourId,
    secondaryColourId,
  ]);

  const editableSet = new Set(editable);
  const inherited = (Object.keys(current) as AttributeKey[])
    .filter((key) => !editableSet.has(key) && current[key])
    .map((key) => ({ key, label: ATTRIBUTES[key].label, valueLabel: labels.get(current[key]!) ?? "" }));

  const fields: PileField[] = editable.map((key) => {
    const valueId = current[key] ?? null;
    return {
      key,
      label: ATTRIBUTES[key].label,
      list: ATTRIBUTES[key].list,
      valueId,
      valueLabel: valueId === null ? null : (labels.get(valueId) ?? null),
      required: required.has(key),
    };
  });

  const needs = fields
    .filter((f) => f.required && f.valueId === null)
    .map((f) => FIELD_SHORT[f.key] ?? f.label.toLowerCase());

  return {
    pileId: pile.id,
    pileCode: pile.code,
    pileName: pile.name,
    stage,
    colourwayId: pile.colourwayId,
    designCode,
    recordName,
    inherited,
    extra,
    colourId,
    colourLabel: colourId === null ? null : (labels.get(colourId) ?? null),
    secondaryColourId,
    secondaryColourLabel: secondaryColourId === null ? null : (labels.get(secondaryColourId) ?? null),
    fields,
    needs,
  };
}

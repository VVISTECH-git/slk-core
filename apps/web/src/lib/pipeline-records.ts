import { sql, type SQL } from "drizzle-orm";

import { ATTRIBUTES, type AttributeKey } from "@/lib/attributes";
import { db } from "@/lib/db";
import {
  BALE_TYPE_TO_PRODUCT,
  FIELD_SHORT,
  ITEM_FALLBACK_FIELDS,
  ITEM_FALLBACK_REQUIRED,
  fieldsThrough,
  needsFor,
  requiredThrough,
  stageAt,
  type PipelineSummary,
} from "@/lib/pipeline-fields";
import { insertDesignWithColourway, type Executor } from "@/lib/record-write";
import { STAGES, type Stage } from "@/lib/stages";

/**
 * Kora to Shelf's last leg: a Product Management record made at the door.
 *
 * When Thaans come back from Print, whoever receives them picks a colour
 * and a motif and which Thaans share them, and that group becomes a
 * colourway of a new design — a draft record, priced later, whose stock
 * arrives Thaan by Thaan as each comes back from Ironing. Everything else
 * the record needs was on the bale's cloth item. The Thaans link to the
 * colourway (`thaan.colourway_id`) and, once shelved, each becomes a piece
 * carrying its own code.
 */

/** The stages at whose receive a Thaan may be sorted into a record — Print onward. */
export const PIPELINE_STAGES: readonly Stage[] = ["Print", "Second Print", "Nellateeta", "Udukulu", "Ironing"];

export function isPipelineStage(stage: string): stage is Stage {
  return (PIPELINE_STAGES as readonly string[]).includes(stage);
}

/** The later of two stage names, by pipeline order — a combined trip's "through" stage wins. */
export function laterStage(a: string, b: string | null): string {
  if (b === null) return a;
  return STAGES.indexOf(b as Stage) > STAGES.indexOf(a as Stage) ? b : a;
}

/** The stage list as a Postgres array literal, for array_position. */
export const STAGE_ARRAY: SQL = sql`${"{" + STAGES.map((s) => `"${s}"`).join(",") + "}"}::text[]`;

async function rows<T>(ex: Executor, query: SQL): Promise<T[]> {
  return (await ex.execute(query)) as T[];
}

function inList(ids: string[]): SQL {
  return sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `);
}

/** Whether `id` is an active member of the list `code`, and its parent if it has one. */
async function activeMember(ex: Executor, id: string, list: string): Promise<{ id: string; parentId: string | null } | null> {
  const [row] = await rows<{ id: string; parentId: string | null }>(ex, sql`
    select lv.id, lv.parent_value_id as "parentId"
    from lookup_value lv join lookup_list ll on ll.id = lv.list_id
    where lv.id = ${id} and ll.code = ${list} and lv.status = 'active'
  `);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// What the cloth item already fixed

/**
 * The facts a record inherits from the cloth item of the bale most of the
 * given Thaans came from: fibre, weave, material, method, audience, craft,
 * border, blouse, sizes — and industry, product type and garment type
 * bridged from the bale's own type by label.
 */
export async function inheritedFromThaans(
  ex: Executor,
  thaanIds: string[],
): Promise<{ attributes: Partial<Record<AttributeKey, string>>; extra: { lengthCm: number | null; widthCm: number | null } }> {
  if (thaanIds.length === 0) return { attributes: {}, extra: { lengthCm: null, widthCm: null } };

  const [row] = await rows<{
    baleType: string;
    hasBlouse: boolean | null;
    fibreTypeId: string | null;
    weaveStructureId: string | null;
    textileMaterialId: string | null;
    productionMethodId: string | null;
    audienceId: string | null;
    craftTechniqueId: string | null;
    craftSubTypeId: string | null;
    borderStyleId: string | null;
    borderHeightId: string | null;
    blouseStyleId: string | null;
    blouseMaterialId: string | null;
    sareeLengthCm: number | null;
    sareeWidthCm: number | null;
  }>(ex, sql`
    select
      b.type                                   as "baleType",
      i.has_blouse                             as "hasBlouse",
      i.fibre_type_id                          as "fibreTypeId",
      i.weave_structure_id                     as "weaveStructureId",
      i.textile_material_id                    as "textileMaterialId",
      i.production_method_id                   as "productionMethodId",
      i.audience_id                            as "audienceId",
      i.craft_technique_id                     as "craftTechniqueId",
      i.craft_sub_type_id                      as "craftSubTypeId",
      i.border_style_id                        as "borderStyleId",
      i.border_height_id                       as "borderHeightId",
      i.blouse_style_id                        as "blouseStyleId",
      i.blouse_material_id                     as "blouseMaterialId",
      i.saree_length_cm::double precision      as "sareeLengthCm",
      i.saree_width_cm::double precision       as "sareeWidthCm"
    from thaan t
    join bale b on b.id = t.bale_id
    join cloth_item i on i.id = b.item_id
    where t.id in (${inList(thaanIds)})
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
  put("craftTechnique", row.craftTechniqueId);
  put("craftSubType", row.craftSubTypeId);
  put("borderStyle", row.borderStyleId);
  put("borderHeight", row.borderHeightId);
  put("blouseStyle", row.blouseStyleId);
  put("blouseMaterial", row.blouseMaterialId);

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
      const [v] = await rows<{ id: string }>(ex, sql`
        select lv.id from lookup_value lv join lookup_list ll on ll.id = lv.list_id
        where ll.code = ${list} and lower(lv.label) = lower(${label}) and lv.status = 'active'
        limit 1
      `);
      if (v !== undefined) attributes[key] = v.id;
    }
  }

  return { attributes, extra: { lengthCm: row.sareeLengthCm, widthCm: row.sareeWidthCm } };
}

// ---------------------------------------------------------------------------
// Making a record at the door, and sorting Thaans into one

export interface NewPipelineRecord {
  thaanIds: string[];
  colourId: string;
  secondaryColourId: string | null;
  motifCategoryId: string;
  motifId: string;
}

/**
 * Makes the draft record for a group of Thaans, inside `tx` — the receive
 * that closes their handovers calls this in the same transaction, so a
 * record can never exist without the receive that made it having happened.
 * Refused when the cloth item never said what fibre it is: the design code
 * is composed from the fibre and is permanent, so it can't be guessed.
 */
export async function createPipelineRecordInTx(
  tx: Executor,
  spec: NewPipelineRecord,
  stage: string,
  actorId: string | null,
): Promise<{ ok: true; id: string; code: string; name: string } | { ok: false; message: string }> {
  if (spec.thaanIds.length === 0) return { ok: false, message: "No Thaans to make a record from." };
  if (!isPipelineStage(stage)) return { ok: false, message: `Records are made at Print — not at ${stage}.` };

  const inherited = await inheritedFromThaans(tx, spec.thaanIds);
  const attributes: Partial<Record<AttributeKey, string | null>> = { ...inherited.attributes };
  if (!attributes.fibreType) {
    return { ok: false, message: "Set the fibre on the bale's cloth item first — the record's code is made from it." };
  }
  if (!attributes.productType && !attributes.homeProductType) {
    return { ok: false, message: "The bale's type doesn't match a product type — check it on the bale." };
  }

  const colour = await activeMember(tx, spec.colourId, "colour");
  if (colour === null) return { ok: false, message: "That colour is not on the list." };
  if (spec.secondaryColourId !== null && (await activeMember(tx, spec.secondaryColourId, "colour")) === null) {
    return { ok: false, message: "That secondary colour is not on the list." };
  }
  const category = await activeMember(tx, spec.motifCategoryId, "motif_category");
  if (category === null) return { ok: false, message: "That motif category is not on the list." };
  const motif = await activeMember(tx, spec.motifId, "motif");
  if (motif === null) return { ok: false, message: "That motif is not on the list." };
  if (motif.parentId !== null && motif.parentId !== category.id) {
    return { ok: false, message: "That motif belongs to a different category." };
  }
  attributes.motifCategory = category.id;
  attributes.motif = motif.id;

  const made = await insertDesignWithColourway(tx, {
    attributes,
    colourId: colour.id,
    secondaryColourId: spec.secondaryColourId,
    extra: { lengthCm: inherited.extra.lengthCm, widthCm: inherited.extra.widthCm },
    notes: `From production — received after ${stage}.`,
    actorId,
  });
  await wantDefaultPhotos(tx, made.id, attributes.productType ?? attributes.homeProductType ?? null);
  return { ok: true, id: made.id, code: made.code, name: made.name };
}

/**
 * The photographs a record made at the door will ask for: the same set
 * the entry forms tick for its product type — every slot not scoped to a
 * type, plus those scoped to this one — so "Photograph it" after the
 * shelf has something to shoot. Empty slots only; nothing is overwritten.
 */
export async function wantDefaultPhotos(ex: Executor, colourwayId: string, productTypeId: string | null): Promise<void> {
  await ex.execute(sql`
    insert into image (colourway_id, slot_id, sort_order)
    select ${colourwayId}, lv.id, (row_number() over (order by lv.sort_order, lv.label) - 1)::int
    from lookup_value lv join lookup_list ll on ll.id = lv.list_id
    where ll.code = 'image_slot' and lv.status = 'active'
      and (lv.parent_value_id is null or lv.parent_value_id = ${productTypeId}::uuid)
    on conflict (colourway_id, slot_id) do nothing
  `);
}

export interface AssignOutcome {
  added: number;
  moved: number;
  /** Thaan codes that couldn't go in, each with why. */
  refused: { code: string; why: string }[];
}

/**
 * Sorts Thaans into a record, inside `tx`. A Thaan already in another
 * record is moved. Refused: one not back from Print yet (what's printed on
 * it is unknown), a voided one, and one already on the shelf — that's
 * stock, and moving stock is a movement, not a sort.
 */
export async function assignThaansToRecordInTx(tx: Executor, colourwayId: string, thaanIds: string[]): Promise<AssignOutcome> {
  const out: AssignOutcome = { added: 0, moved: 0, refused: [] };

  for (const thaanId of thaanIds) {
    const [t] = await rows<{ code: string | null; voided: boolean; printed: boolean; shelved: boolean; colourwayId: string | null }>(tx, sql`
      select
        t.code,
        (t.voided_at is not null) as "voided",
        (t.piece_id is not null)  as "shelved",
        exists (
          select 1 from handover h where h.thaan_id = t.id and h.received_at is not null
            and (h.stage = 'Print' or h.through_stage in ('Print', 'Second Print', 'Nellateeta', 'Udukulu', 'Ironing'))
        ) as "printed",
        t.colourway_id as "colourwayId"
      from thaan t where t.id = ${thaanId}
    `);
    const code = t?.code ?? thaanId;
    if (t === undefined) { out.refused.push({ code, why: "not found" }); continue; }
    if (t.voided) { out.refused.push({ code, why: "voided" }); continue; }
    if (t.shelved) { out.refused.push({ code, why: "already on the shelf" }); continue; }
    if (!t.printed) { out.refused.push({ code, why: "not back from Print yet" }); continue; }
    if (t.colourwayId === colourwayId) continue;

    await tx.execute(sql`update thaan set colourway_id = ${colourwayId}, updated_at = now() where id = ${thaanId}`);
    if (t.colourwayId === null) out.added++;
    else out.moved++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reading a record's production side

export interface PipelineThaan {
  id: string;
  code: string | null;
  baleCode: string;
  voidedAt: string | null;
  /** "Out for Nellateeta", "Ready for Udukulu" — where it is now, or null once shelved. */
  openStage: string | null;
  completedStages: number;
  /** Set once the Thaan is on the shelf — equal to its own code. */
  pieceCode: string | null;
  locationName: string | null;
  isHeld: boolean | null;
}

export async function loadPipelineThaans(colourwayId: string): Promise<PipelineThaan[]> {
  return rows<PipelineThaan>(db, sql`
    select
      t.id,
      t.code,
      b.code                                                as "baleCode",
      to_char(t.voided_at, 'DD Mon YYYY')                  as "voidedAt",
      case when open_h.through_stage is null then open_h.stage
           else open_h.stage || ' + ' || open_h.through_stage end as "openStage",
      coalesce(done.n, 0)::int                              as "completedStages",
      pc.code                                               as "pieceCode",
      here.name                                             as "locationName",
      pos.is_held                                           as "isHeld"
    from thaan t
    join bale b on b.id = t.bale_id
    left join piece pc on pc.id = t.piece_id
    left join piece_position pos on pos.piece_id = pc.id
    left join location here on here.id = pos.location_id
    left join handover open_h on open_h.thaan_id = t.id and open_h.received_at is null
    left join lateral (
      select count(*)::int as n from handover h where h.thaan_id = t.id and h.received_at is not null
    ) done on true
    where t.colourway_id = ${colourwayId}
    order by t.code
  `);
}

/** The production summary of one record — the same numbers the list shows. */
export async function loadPipelineSummary(colourwayId: string): Promise<PipelineSummary> {
  const [row] = await rows<{
    thaanCount: number;
    finishedCount: number;
    shelvedCount: number;
    stageIndex: number | null;
    motifId: string | null;
    craftTechniqueId: string | null;
    fibreTypeId: string | null;
    productTypeId: string | null;
    homeProductTypeId: string | null;
  }>(db, sql`
    select
      (select count(*)::int from thaan t where t.colourway_id = cw.id and t.voided_at is null) as "thaanCount",
      (select count(*)::int from thaan t where t.colourway_id = cw.id and t.piece_id is not null) as "shelvedCount",
      (select count(*)::int from thaan t where t.colourway_id = cw.id and t.voided_at is null and t.piece_id is null
        and exists (select 1 from handover h where h.thaan_id = t.id and h.received_at is not null and (h.stage = 'Ironing' or h.through_stage = 'Ironing')))
                                              as "finishedCount",
      (select max(array_position(${STAGE_ARRAY}, coalesce(h.through_stage, h.stage)))
        from handover h join thaan t on t.id = h.thaan_id where t.colourway_id = cw.id and h.received_at is not null)
                                              as "stageIndex",
      d.motif_id                              as "motifId",
      d.craft_technique_id                    as "craftTechniqueId",
      d.fibre_type_id                         as "fibreTypeId",
      d.product_type_id                       as "productTypeId",
      d.home_product_type_id                  as "homeProductTypeId"
    from colourway cw join design d on d.id = cw.design_id
    where cw.id = ${colourwayId}
  `);
  if (row === undefined || row.thaanCount === 0) {
    return { thaanCount: 0, finishedCount: 0, shelvedCount: 0, stage: null, needs: [] };
  }
  const stage = stageAt(row.stageIndex);
  return {
    thaanCount: row.thaanCount,
    finishedCount: row.finishedCount,
    shelvedCount: row.shelvedCount,
    stage,
    needs: needsFor(stage, {
      motif: row.motifId,
      craftTechnique: row.craftTechniqueId,
      fibreType: row.fibreTypeId,
      productType: row.productTypeId,
      homeProductType: row.homeProductTypeId,
    }),
  };
}

// ---------------------------------------------------------------------------
// "Fill in details": the focused form for what a door-made record still needs

export interface FillField {
  key: AttributeKey;
  label: string;
  /** The Master List the value is picked from. */
  list: string;
  valueId: string | null;
  valueLabel: string | null;
  required: boolean;
}

export interface RecordFill {
  colourwayId: string;
  designCode: string;
  recordName: string;
  /** The furthest stage its Thaans have come back from. */
  stage: Stage;
  thaanCount: number;
  /** Already known — from the cloth item, or set since — shown read-only. */
  inherited: { key: AttributeKey; label: string; valueLabel: string }[];
  extra: { lengthCm: number | null; widthCm: number | null };
  colourId: string | null;
  colourLabel: string | null;
  secondaryColourId: string | null;
  secondaryColourLabel: string | null;
  /** The editable questions for this record right now. */
  fields: FillField[];
  /** Short names of the required fields still empty — "motif", "craft". */
  needs: string[];
}

async function labelsOf(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const wanted = ids.filter((id): id is string => typeof id === "string" && id !== "");
  if (wanted.length === 0) return new Map();
  const found = await rows<{ id: string; label: string }>(db, sql`
    select id, label from lookup_value where id in (${inList(wanted)})
  `);
  return new Map(found.map((r) => [r.id, r.label]));
}

export async function loadRecordFill(colourwayId: string): Promise<RecordFill | null> {
  const [d] = await rows<Record<string, string | null> & { extra: { lengthCm?: number | null; widthCm?: number | null } | null }>(db, sql`
    select d.*, d.code as "designCode", d.name as "designName", cw.colour_id as "cwColour", cw.secondary_colour_id as "cwSecondary"
    from colourway cw join design d on d.id = cw.design_id where cw.id = ${colourwayId}
  `);
  if (d === undefined) return null;

  const summary = await loadPipelineSummary(colourwayId);
  const stage = (summary.stage ?? "Print") as Stage;

  const current: Partial<Record<AttributeKey, string | null>> = {};
  for (const key of Object.keys(ATTRIBUTES) as AttributeKey[]) {
    const v = d[ATTRIBUTES[key].column];
    if (typeof v === "string") current[key] = v;
  }

  const editable = fieldsThrough(stage);
  const required = new Set(requiredThrough(stage));
  const productTypeKey: AttributeKey =
    current.industry === undefined ? "productType" : current.homeProductType !== undefined ? "homeProductType" : "productType";
  for (const key of ["fibreType", productTypeKey, ...ITEM_FALLBACK_FIELDS] as AttributeKey[]) {
    if (!editable.includes(key) && (current[key] === undefined || current[key] === null)) {
      editable.push(key);
      if (key === "fibreType" || key === productTypeKey || ITEM_FALLBACK_REQUIRED.includes(key)) required.add(key);
    }
  }

  const colourId = d["cwColour"] ?? null;
  const secondaryColourId = d["cwSecondary"] ?? null;
  const labels = await labelsOf([...Object.values(current), colourId, secondaryColourId]);

  const editableSet = new Set(editable);
  const inherited = (Object.keys(current) as AttributeKey[])
    .filter((key) => !editableSet.has(key) && current[key])
    .map((key) => ({ key, label: ATTRIBUTES[key].label, valueLabel: labels.get(current[key]!) ?? "" }));

  const fields: FillField[] = editable.map((key) => {
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

  return {
    colourwayId,
    designCode: d["designCode"] ?? "",
    recordName: d["designName"] ?? "",
    stage,
    thaanCount: summary.thaanCount,
    inherited,
    extra: { lengthCm: d.extra?.lengthCm ?? null, widthCm: d.extra?.widthCm ?? null },
    colourId,
    colourLabel: colourId === null ? null : (labels.get(colourId) ?? null),
    secondaryColourId,
    secondaryColourLabel: secondaryColourId === null ? null : (labels.get(secondaryColourId) ?? null),
    fields,
    needs: fields.filter((f) => f.required && f.valueId === null).map((f) => FIELD_SHORT[f.key] ?? f.label.toLowerCase()),
  };
}

// ---------------------------------------------------------------------------
// From record to shelf

export type ShelfThaan = { id: string; code: string };

export interface RecordShelf {
  colourwayId: string;
  designCode: string;
  recordName: string;
  /** Whether this record is tracked piece by piece (item codes) rather than by length. */
  pieceTracked: boolean;
  /** Back from Ironing, not voided, not yet on the shelf — what going on the shelf puts into stock. */
  finished: ShelfThaan[];
  /** Already stock, with the piece code = Thaan code. */
  shelved: ShelfThaan[];
  /** Still somewhere in the pipeline. */
  inPipeline: number;
  /** Current prices, rupees as strings ("" when not set) — the form's initial values. */
  prices: { cost: string; making: string; wholesale: string; retail: string; mrp: string };
  /** Where stock can be put — every active location we own. */
  locations: { id: string; name: string; code: string }[];
  /** What the record still needs before it can be filed — blocks the shelf. */
  needs: string[];
  /** Short reasons this record can't go on the shelf yet; empty means it can. */
  blockers: string[];
}

function rupees(minor: number | null): string {
  return minor === null ? "" : (minor / 100).toString();
}

export async function loadRecordShelf(colourwayId: string): Promise<RecordShelf | null> {
  const [record] = await rows<{
    designCode: string;
    recordName: string;
    pieceTracked: boolean | null;
    cost: number | null;
    making: number | null;
    wholesale: number | null;
    retail: number | null;
    mrp: number | null;
  }>(db, sql`
    select
      d.code                                           as "designCode",
      d.name                                           as "recordName",
      (d.is_serialised and coalesce(uom.code, '') <> 'metre') as "pieceTracked",
      cw.cost_minor::double precision                  as "cost",
      cw.making_minor::double precision                as "making",
      cw.wholesale_minor::double precision             as "wholesale",
      cw.retail_minor::double precision                as "retail",
      cw.mrp_minor::double precision                   as "mrp"
    from colourway cw
    join design d on d.id = cw.design_id
    left join lookup_value uom on uom.id = d.uom_id
    where cw.id = ${colourwayId}
  `);
  if (record === undefined) return null;

  const thaans = await rows<{ id: string; code: string; finished: boolean; shelved: boolean }>(db, sql`
    select
      t.id, t.code,
      exists (
        select 1 from handover h where h.thaan_id = t.id and h.received_at is not null
          and (h.stage = 'Ironing' or h.through_stage = 'Ironing')
      )                                   as "finished",
      (t.piece_id is not null)            as "shelved"
    from thaan t
    where t.colourway_id = ${colourwayId} and t.voided_at is null and t.code is not null
    order by t.code
  `);
  const locations = await rows<{ id: string; name: string; code: string }>(db, sql`
    select id, name, code from location where is_active and is_internal order by name
  `);
  const summary = await loadPipelineSummary(colourwayId);

  const finished = thaans.filter((t) => t.finished && !t.shelved).map(({ id, code }) => ({ id, code }));
  const shelved = thaans.filter((t) => t.shelved).map(({ id, code }) => ({ id, code }));
  const inPipeline = thaans.filter((t) => !t.finished && !t.shelved).length;

  const blockers: string[] = [];
  if (summary.needs.length > 0) blockers.push(`still needs ${summary.needs.join(", ")}`);
  if (finished.length === 0) blockers.push(shelved.length > 0 ? "nothing new back from Ironing" : "nothing back from Ironing yet");
  if (locations.length === 0) blockers.push("no location to put stock in");

  return {
    colourwayId,
    designCode: record.designCode,
    recordName: record.recordName,
    pieceTracked: record.pieceTracked ?? false,
    finished,
    shelved,
    inPipeline,
    prices: {
      cost: rupees(record.cost),
      making: rupees(record.making),
      wholesale: rupees(record.wholesale),
      retail: rupees(record.retail),
      mrp: rupees(record.mrp),
    },
    locations,
    needs: summary.needs,
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

/**
 * Puts the finished Thaans of a record into stock, inside `tx`: one
 * consignment into `locationId`, one `received` movement from Production,
 * and — for a piece-tracked record — one piece per Thaan whose code is the
 * Thaan's own. Returns the product code and what became stock.
 */
export async function shelveInTx(
  tx: Executor,
  colourwayId: string,
  thaans: ShelfThaan[],
  locationId: string,
  pieceTracked: boolean,
  note: string,
  actorId: string | null,
): Promise<{ productCode: string; pieceCodes: string[] }> {
  const [source] = await rows<{ id: string }>(tx, sql`
    select id from location where code = 'PRODUCTION'
    union all
    select id from location where not is_internal and code <> 'PRODUCTION'
    limit 1
  `);
  if (source === undefined) throw new Error("No external location is set up to receive stock from.");

  const [batch] = await rows<{ id: string; code: string }>(tx, sql`
    insert into batch (colourway_id, code, qty, location_id, reference, note)
    values (${colourwayId}, nextval('product_code_seq')::text, ${thaans.length}, ${locationId}, null, ${note})
    returning id, code
  `);
  if (batch === undefined) throw new Error("Could not open a consignment.");

  const pieceCodes: string[] = [];
  if (pieceTracked) {
    const [next] = await rows<{ max: number }>(tx, sql`
      select coalesce(max(serial), 0)::int as max from piece where colourway_id = ${colourwayId}
    `);
    let serial = next?.max ?? 0;
    for (const t of thaans) {
      serial += 1;
      const [p] = await rows<{ id: string }>(tx, sql`
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

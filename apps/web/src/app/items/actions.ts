"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { guard } from "@/lib/session";

export interface ActionResult {
  ok: boolean;
  message: string;
}

export interface ClothItemDraft {
  name: string;
  clothTypes: string[];
  /** Saree cloth only — cleared for anything that isn't one. */
  hasBlouse: boolean | null;
  pallu: string | null;
  /** A `lookup_value.id` from the "Fibre Type" list — not saree-specific, never cleared by Cloth Type. */
  fibreTypeId: string | null;
  /** Woven how — Product Management's Weave Structure list. */
  weaveStructureId: string | null;
  /** Made of what within the fibre — Textile Material list, narrowed by `fibreTypeId`. */
  textileMaterialId: string | null;
  productionMethodId: string | null;
  audienceId: string | null;
  /** Saree cloth only. */
  borderStyleId: string | null;
  borderHeightId: string | null;
  /** Only when there is a blouse piece. */
  blouseStyleId: string | null;
  blouseMaterialId: string | null;
  /** The raw cloth's own measurements, in centimetres — saree cloth only; blouse length only with a blouse. */
  sareeLengthCm: number | null;
  sareeWidthCm: number | null;
  palluLengthCm: number | null;
  blouseLengthCm: number | null;
}

/**
 * Drizzle's `sql` template spreads a JS array into `($1, $2, ...)` — built
 * for `IN (...)`, not for binding one array-typed parameter. Handing
 * Postgres its own array literal syntax as a single string sidesteps that;
 * the `::text[]` cast on the call site parses it back into a real array.
 * Same helper as `vendors/actions.ts`.
 */
function pgTextArrayLiteral(values: string[]): string {
  const escaped = values.map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
  return `{${escaped.join(",")}}`;
}

function revalidate() {
  revalidatePath("/items");
  // The bale form's dropdown reads from the same list.
  revalidatePath("/bales");
  // A Thaan shows its item's properties.
  revalidatePath("/thaans");
}

/** What the item is left with once every rule below has been applied — exactly what gets saved. */
type CleanItem = Omit<ClothItemDraft, "name" | "clothTypes"> & { name: string; clothTypes: string[] };

const PALLUS = ["Same as body", "Contrast"];

/**
 * A `lookup_value` id must name a real, active value in the expected list —
 * not just any uuid. Returns its parent (a textile material's fibre) so the
 * caller can check the two agree.
 */
async function checkLookup(
  id: string | null,
  listCode: string,
  what: string,
): Promise<{ error: string } | { parentId: string | null }> {
  if (id === null) return { parentId: null };
  const [row] = await db.execute<{ parentId: string | null }>(sql`
    select lv.parent_value_id as "parentId" from lookup_value lv
    join lookup_list ll on ll.id = lv.list_id
    where lv.id = ${id} and ll.code = ${listCode} and lv.status = 'active'
  `);
  return row === undefined ? { error: `That ${what} is no longer on the list.` } : { parentId: row.parentId };
}

function size(value: number | null, what: string): string | null {
  if (value === null) return null;
  return Number.isFinite(value) && value > 0 ? null : `${what} must be a number greater than zero.`;
}

/**
 * Everything `createClothItem` and `updateClothItem` both need — one place,
 * so the two can't quietly drift apart. Saree-only answers are discarded for
 * anything that isn't saree cloth (asking would be a question that doesn't
 * apply), and blouse answers are discarded unless there is a blouse piece.
 */
async function prepare(draft: ClothItemDraft): Promise<{ ok: false; message: string } | { ok: true; item: CleanItem }> {
  const name = draft.name.trim();
  if (name === "") return { ok: false, message: "Name is required." };
  if (draft.pallu !== null && !PALLUS.includes(draft.pallu)) return { ok: false, message: "Unknown pallu." };

  const isSaree = draft.clothTypes.includes("Sarees");
  const hasBlouse = isSaree ? draft.hasBlouse : null;
  const withBlouse = isSaree && hasBlouse === true;

  for (const [value, what] of [
    [draft.sareeLengthCm, "Saree length"],
    [draft.sareeWidthCm, "Saree width"],
    [draft.palluLengthCm, "Pallu length"],
    [draft.blouseLengthCm, "Blouse length"],
  ] as const) {
    const problem = size(value, what);
    if (problem !== null) return { ok: false, message: problem };
  }

  const checks = await Promise.all([
    checkLookup(draft.fibreTypeId, "fibre_type", "fibre"),
    checkLookup(draft.weaveStructureId, "weave_structure", "weave"),
    checkLookup(draft.textileMaterialId, "textile_material", "textile material"),
    checkLookup(draft.productionMethodId, "production_method", "production method"),
    checkLookup(draft.audienceId, "audience_type", "audience"),
    isSaree ? checkLookup(draft.borderStyleId, "border_style", "border style") : { parentId: null },
    isSaree ? checkLookup(draft.borderHeightId, "border_height", "border height") : { parentId: null },
    withBlouse ? checkLookup(draft.blouseStyleId, "blouse_style", "blouse style") : { parentId: null },
    withBlouse ? checkLookup(draft.blouseMaterialId, "blouse_material", "blouse material") : { parentId: null },
  ]);
  for (const c of checks) if ("error" in c) return { ok: false, message: c.error };

  // A textile material that sits under a fibre only makes sense with that fibre.
  const materialParent = "parentId" in checks[2] ? checks[2].parentId : null;
  if (draft.textileMaterialId !== null && materialParent !== null && materialParent !== draft.fibreTypeId) {
    return { ok: false, message: "That textile material belongs to a different fibre — pick the fibre first." };
  }

  return {
    ok: true,
    item: {
      name,
      clothTypes: draft.clothTypes,
      hasBlouse,
      pallu: isSaree ? draft.pallu : null,
      fibreTypeId: draft.fibreTypeId,
      weaveStructureId: draft.weaveStructureId,
      textileMaterialId: draft.textileMaterialId,
      productionMethodId: draft.productionMethodId,
      audienceId: draft.audienceId,
      borderStyleId: isSaree ? draft.borderStyleId : null,
      borderHeightId: isSaree ? draft.borderHeightId : null,
      blouseStyleId: withBlouse ? draft.blouseStyleId : null,
      blouseMaterialId: withBlouse ? draft.blouseMaterialId : null,
      sareeLengthCm: isSaree ? draft.sareeLengthCm : null,
      sareeWidthCm: isSaree ? draft.sareeWidthCm : null,
      palluLengthCm: isSaree ? draft.palluLengthCm : null,
      blouseLengthCm: withBlouse ? draft.blouseLengthCm : null,
    },
  };
}

export async function createClothItem(draft: ClothItemDraft): Promise<ActionResult> {
  const denied = await guard("floor");
  if (denied !== null) return denied;

  const prepared = await prepare(draft);
  if (!prepared.ok) return prepared;
  const it = prepared.item;

  const [clash] = await db.execute<{ name: string }>(sql`
    select name from cloth_item where lower(name) = lower(${it.name})
  `);
  if (clash !== undefined) {
    return { ok: false, message: `"${clash.name}" is already on the list.` };
  }

  await db.execute(sql`
    insert into cloth_item (
      name, code, cloth_types, has_blouse, pallu, fibre_type_id,
      weave_structure_id, textile_material_id, production_method_id, audience_id,
      border_style_id, border_height_id, blouse_style_id, blouse_material_id,
      saree_length_cm, saree_width_cm, pallu_length_cm, blouse_length_cm
    )
    values (
      ${it.name},
      'I' || nextval('cloth_item_code_seq'),
      ${pgTextArrayLiteral(it.clothTypes)}::text[],
      ${it.hasBlouse},
      ${it.pallu},
      ${it.fibreTypeId},
      ${it.weaveStructureId},
      ${it.textileMaterialId},
      ${it.productionMethodId},
      ${it.audienceId},
      ${it.borderStyleId},
      ${it.borderHeightId},
      ${it.blouseStyleId},
      ${it.blouseMaterialId},
      ${it.sareeLengthCm},
      ${it.sareeWidthCm},
      ${it.palluLengthCm},
      ${it.blouseLengthCm}
    )
  `);

  revalidate();

  return { ok: true, message: `Added ${it.name}.` };
}

/**
 * Fixing a typo, and active/inactive in the same save — a cloth item
 * already on bales can't be erased without erasing their history, so
 * status is the way one stops being offered for a new bale. The name
 * check excludes this row itself.
 */
export async function updateClothItem(
  itemId: string,
  draft: ClothItemDraft,
  status: "active" | "inactive",
): Promise<ActionResult> {
  const denied = await guard("floor");
  if (denied !== null) return denied;

  const prepared = await prepare(draft);
  if (!prepared.ok) return prepared;
  const it = prepared.item;

  const [clash] = await db.execute<{ name: string }>(sql`
    select name from cloth_item where lower(name) = lower(${it.name}) and id <> ${itemId}
  `);
  if (clash !== undefined) {
    return { ok: false, message: `"${clash.name}" is already on the list.` };
  }

  const [row] = await db.execute<{ name: string }>(sql`
    update cloth_item
    set name = ${it.name},
        status = ${status},
        cloth_types = ${pgTextArrayLiteral(it.clothTypes)}::text[],
        has_blouse = ${it.hasBlouse},
        pallu = ${it.pallu},
        fibre_type_id = ${it.fibreTypeId},
        weave_structure_id = ${it.weaveStructureId},
        textile_material_id = ${it.textileMaterialId},
        production_method_id = ${it.productionMethodId},
        audience_id = ${it.audienceId},
        border_style_id = ${it.borderStyleId},
        border_height_id = ${it.borderHeightId},
        blouse_style_id = ${it.blouseStyleId},
        blouse_material_id = ${it.blouseMaterialId},
        saree_length_cm = ${it.sareeLengthCm},
        saree_width_cm = ${it.sareeWidthCm},
        pallu_length_cm = ${it.palluLengthCm},
        blouse_length_cm = ${it.blouseLengthCm},
        updated_at = now()
    where id = ${itemId}
    returning name
  `);

  if (row === undefined) {
    return { ok: false, message: "That item no longer exists." };
  }

  revalidate();

  return { ok: true, message: `${row.name} updated.` };
}

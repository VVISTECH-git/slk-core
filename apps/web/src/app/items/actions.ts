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
  /** Only meaningful when `clothTypes` includes "Sarees" — cleared otherwise. */
  hasBlouse: boolean | null;
  border: string | null;
  pallu: string | null;
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
}

/**
 * Blouse, border and pallu describe a saree's own cloth — asking about them
 * when "Sarees" isn't even one of this item's cloth types would be asking a
 * question that doesn't apply, so the answer is discarded rather than saved.
 */
function saneSareeFields(draft: Pick<ClothItemDraft, "clothTypes" | "hasBlouse" | "border" | "pallu">) {
  const isSaree = draft.clothTypes.includes("Sarees");
  return {
    hasBlouse: isSaree ? draft.hasBlouse : null,
    border: isSaree ? draft.border : null,
    pallu: isSaree ? draft.pallu : null,
  };
}

export async function createClothItem(draft: ClothItemDraft): Promise<ActionResult> {
  const denied = await guard("floor");
  if (denied !== null) return denied;

  const cleanName = draft.name.trim();
  if (cleanName === "") {
    return { ok: false, message: "Name is required." };
  }
  if (draft.border !== null && !["Zari", "Plain", "Contrast", "Tasseled"].includes(draft.border)) {
    return { ok: false, message: "Unknown border." };
  }
  if (draft.pallu !== null && !["Same as body", "Contrast"].includes(draft.pallu)) {
    return { ok: false, message: "Unknown pallu." };
  }

  const [clash] = await db.execute<{ name: string }>(sql`
    select name from cloth_item where lower(name) = lower(${cleanName})
  `);
  if (clash !== undefined) {
    return { ok: false, message: `"${clash.name}" is already on the list.` };
  }

  const saree = saneSareeFields(draft);

  await db.execute(sql`
    insert into cloth_item (name, code, cloth_types, has_blouse, border, pallu)
    values (
      ${cleanName},
      'I' || nextval('cloth_item_code_seq'),
      ${pgTextArrayLiteral(draft.clothTypes)}::text[],
      ${saree.hasBlouse},
      ${saree.border},
      ${saree.pallu}
    )
  `);

  revalidate();

  return { ok: true, message: `Added ${cleanName}.` };
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

  const cleanName = draft.name.trim();
  if (cleanName === "") {
    return { ok: false, message: "Name is required." };
  }
  if (draft.border !== null && !["Zari", "Plain", "Contrast", "Tasseled"].includes(draft.border)) {
    return { ok: false, message: "Unknown border." };
  }
  if (draft.pallu !== null && !["Same as body", "Contrast"].includes(draft.pallu)) {
    return { ok: false, message: "Unknown pallu." };
  }

  const [clash] = await db.execute<{ name: string }>(sql`
    select name from cloth_item where lower(name) = lower(${cleanName}) and id <> ${itemId}
  `);
  if (clash !== undefined) {
    return { ok: false, message: `"${clash.name}" is already on the list.` };
  }

  const saree = saneSareeFields(draft);

  const [row] = await db.execute<{ name: string }>(sql`
    update cloth_item
    set name = ${cleanName},
        status = ${status},
        cloth_types = ${pgTextArrayLiteral(draft.clothTypes)}::text[],
        has_blouse = ${saree.hasBlouse},
        border = ${saree.border},
        pallu = ${saree.pallu},
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

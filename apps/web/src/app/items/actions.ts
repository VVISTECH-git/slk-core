"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { guard } from "@/lib/session";

export interface ActionResult {
  ok: boolean;
  message: string;
}

function revalidate() {
  revalidatePath("/items");
  // The bale form's dropdown reads from the same list.
  revalidatePath("/bales");
}

export async function createClothItem(name: string): Promise<ActionResult> {
  const denied = await guard("floor");
  if (denied !== null) return denied;

  const cleanName = name.trim();
  if (cleanName === "") {
    return { ok: false, message: "Name is required." };
  }

  const [clash] = await db.execute<{ name: string }>(sql`
    select name from cloth_item where lower(name) = lower(${cleanName})
  `);
  if (clash !== undefined) {
    return { ok: false, message: `"${clash.name}" is already on the list.` };
  }

  await db.execute(sql`
    insert into cloth_item (name, code) values (${cleanName}, 'I' || nextval('cloth_item_code_seq'))
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
  name: string,
  status: "active" | "inactive",
): Promise<ActionResult> {
  const denied = await guard("floor");
  if (denied !== null) return denied;

  const cleanName = name.trim();
  if (cleanName === "") {
    return { ok: false, message: "Name is required." };
  }

  const [clash] = await db.execute<{ name: string }>(sql`
    select name from cloth_item where lower(name) = lower(${cleanName}) and id <> ${itemId}
  `);
  if (clash !== undefined) {
    return { ok: false, message: `"${clash.name}" is already on the list.` };
  }

  const [row] = await db.execute<{ name: string }>(sql`
    update cloth_item
    set name = ${cleanName}, status = ${status}, updated_at = now()
    where id = ${itemId}
    returning name
  `);

  if (row === undefined) {
    return { ok: false, message: "That item no longer exists." };
  }

  revalidate();

  return { ok: true, message: `${row.name} updated.` };
}

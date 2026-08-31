"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { lookupList, lookupValue } from "@slk/db";

import { db } from "@/lib/db";

/**
 * Every action is an untrusted entry point — a Server Action is reachable by
 * anyone who can POST to the page, whether or not the UI rendered a button.
 * So each one re-reads the list, re-checks the rule, and never trusts that the
 * form only sent what the form offered.
 *
 * Deliberately absent: delete and merge. Both need a usage count against the
 * catalogue tables, which do not exist yet. Offering them now would let
 * someone remove a value the moment records start referencing it.
 */

export interface ActionResult {
  ok: boolean;
  message: string;
}

/** Mirrors the seed's slugify — a code, once assigned, is never regenerated. */
function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function listByCode(code: string) {
  const rows = await db
    .select()
    .from(lookupList)
    .where(eq(lookupList.code, code));

  return rows[0];
}

export async function addValue(
  listCode: string,
  formData: FormData,
): Promise<ActionResult> {
  const list = await listByCode(listCode);
  if (list === undefined) return { ok: false, message: "No such list." };

  const raw = String(formData.get("label") ?? "").trim();
  if (raw === "") return { ok: false, message: "Type a value first." };

  // colour and descriptor are stored lower case, as the workbook has them.
  const label = list.lowercaseValues ? raw.toLowerCase() : raw;
  const code = slugify(label);

  if (code === "") {
    return { ok: false, message: "That value has no letters or digits in it." };
  }

  const clash = await db
    .select({ label: lookupValue.label })
    .from(lookupValue)
    .where(
      and(
        eq(lookupValue.listId, list.id),
        sql`lower(${lookupValue.label}) = lower(${label})`,
      ),
    );

  if (clash[0] !== undefined) {
    return { ok: false, message: `"${clash[0].label}" is already in this list.` };
  }

  const [next] = await db
    .select({ max: sql<number>`coalesce(max(${lookupValue.sortOrder}), -1)::int` })
    .from(lookupValue)
    .where(eq(lookupValue.listId, list.id));

  await db.insert(lookupValue).values({
    listId: list.id,
    code,
    label,
    sortOrder: (next?.max ?? -1) + 1,
  });

  revalidatePath(`/vocabulary/${listCode}`);
  revalidatePath("/vocabulary");

  return { ok: true, message: `Added ${label}.` };
}

export async function renameValue(
  listCode: string,
  formData: FormData,
): Promise<ActionResult> {
  const list = await listByCode(listCode);
  if (list === undefined) return { ok: false, message: "No such list." };

  const id = String(formData.get("id") ?? "");
  const raw = String(formData.get("label") ?? "").trim();
  if (raw === "") return { ok: false, message: "A value needs a name." };

  const label = list.lowercaseValues ? raw.toLowerCase() : raw;

  const current = await db
    .select()
    .from(lookupValue)
    .where(and(eq(lookupValue.id, id), eq(lookupValue.listId, list.id)));

  const value = current[0];
  if (value === undefined) return { ok: false, message: "No such value." };
  if (value.label === label) return { ok: true, message: "" };

  const clash = await db
    .select({ label: lookupValue.label })
    .from(lookupValue)
    .where(
      and(
        eq(lookupValue.listId, list.id),
        ne(lookupValue.id, id),
        sql`lower(${lookupValue.label}) = lower(${label})`,
      ),
    );

  if (clash[0] !== undefined) {
    return { ok: false, message: `"${clash[0].label}" is already in this list.` };
  }

  // `code` deliberately stays as it was. Records and application logic hold
  // onto it, and design codes printed on QR labels are built from it.
  await db
    .update(lookupValue)
    .set({ label, updatedAt: new Date() })
    .where(eq(lookupValue.id, id));

  revalidatePath(`/vocabulary/${listCode}`);

  return { ok: true, message: `Renamed to "${label}".` };
}

export async function setValueActive(
  listCode: string,
  formData: FormData,
): Promise<ActionResult> {
  const list = await listByCode(listCode);
  if (list === undefined) return { ok: false, message: "No such list." };

  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";

  const current = await db
    .select()
    .from(lookupValue)
    .where(and(eq(lookupValue.id, id), eq(lookupValue.listId, list.id)));

  const value = current[0];
  if (value === undefined) return { ok: false, message: "No such value." };

  // Retiring a parent would leave its children pointing at something that is
  // no longer offered, so the children have to be dealt with first.
  if (!active) {
    const [children] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(lookupValue)
      .where(
        and(eq(lookupValue.parentValueId, id), eq(lookupValue.isActive, true)),
      );

    if ((children?.n ?? 0) > 0) {
      return {
        ok: false,
        message: `${children?.n} active value${children?.n === 1 ? "" : "s"} still belong to "${value.label}". Move or retire ${children?.n === 1 ? "it" : "them"} first.`,
      };
    }
  }

  await db
    .update(lookupValue)
    .set({ isActive: active, updatedAt: new Date() })
    .where(eq(lookupValue.id, id));

  revalidatePath(`/vocabulary/${listCode}`);
  revalidatePath("/vocabulary");

  return {
    ok: true,
    message: active
      ? `"${value.label}" is offered again.`
      : `"${value.label}" retired — existing records keep it.`,
  };
}

export async function clearFlags(
  listCode: string,
  formData: FormData,
): Promise<ActionResult> {
  const list = await listByCode(listCode);
  if (list === undefined) return { ok: false, message: "No such list." };

  const id = String(formData.get("id") ?? "");

  const current = await db
    .select()
    .from(lookupValue)
    .where(and(eq(lookupValue.id, id), eq(lookupValue.listId, list.id)));

  const value = current[0];
  if (value === undefined) return { ok: false, message: "No such value." };

  await db
    .update(lookupValue)
    .set({ isProposed: false, needsReview: false, updatedAt: new Date() })
    .where(eq(lookupValue.id, id));

  revalidatePath(`/vocabulary/${listCode}`);
  revalidatePath("/vocabulary");

  return { ok: true, message: `"${value.label}" confirmed.` };
}

"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { guard } from "@/lib/session";

export interface ActionResult {
  ok: boolean;
  message: string;
}

export interface VendorDraft {
  name: string;
  phone: string;
  village: string;
  stages: string[];
  notes: string;
}

/**
 * Drizzle's `sql` template spreads a JS array into `($1, $2, ...)` —
 * built for `IN (...)`, not for binding one array-typed parameter. Handing
 * Postgres its own array literal syntax as a single string sidesteps that;
 * the `::text[]` cast on the call site parses it back into a real array.
 */
function pgTextArrayLiteral(values: string[]): string {
  const escaped = values.map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
  return `{${escaped.join(",")}}`;
}

export async function createVendor(draft: VendorDraft): Promise<ActionResult> {
  const denied = await guard("floor");
  if (denied !== null) return denied;

  const cleanName = draft.name.trim();
  if (cleanName === "") {
    return { ok: false, message: "Name is required." };
  }

  const [clash] = await db.execute<{ name: string }>(sql`
    select name from vendor where lower(name) = lower(${cleanName})
  `);
  if (clash !== undefined) {
    return { ok: false, message: `"${clash.name}" is already on the list.` };
  }

  await db.execute(sql`
    insert into vendor (name, phone, village, stages, notes)
    values (
      ${cleanName},
      ${draft.phone.trim() || null},
      ${draft.village.trim() || null},
      ${pgTextArrayLiteral(draft.stages)}::text[],
      ${draft.notes.trim() || null}
    )
  `);

  revalidatePath("/vendors");

  return { ok: true, message: `Added ${cleanName}.` };
}

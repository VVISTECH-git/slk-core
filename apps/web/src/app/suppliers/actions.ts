"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { guard } from "@/lib/session";

export interface ActionResult {
  ok: boolean;
  message: string;
}

export interface SupplierDraft {
  name: string;
  codePrefix: string;
  phone: string;
  gstin: string;
  address: string;
  contactPerson: string;
}

function revalidate() {
  revalidatePath("/suppliers");
  // The bale form's dropdown reads from the same list.
  revalidatePath("/bales");
}

export async function createSupplier(draft: SupplierDraft): Promise<ActionResult> {
  const denied = await guard("floor");
  if (denied !== null) return denied;

  const cleanName = draft.name.trim();
  const cleanPrefix = draft.codePrefix.trim().toUpperCase();

  if (cleanName === "") {
    return { ok: false, message: "Name is required." };
  }
  if (cleanPrefix === "" || !/^[A-Z]{1,4}$/.test(cleanPrefix)) {
    return { ok: false, message: "Code must be 1 to 4 letters, like A or GJ." };
  }

  const [nameClash] = await db.execute<{ name: string }>(sql`
    select name from supplier where lower(name) = lower(${cleanName})
  `);
  if (nameClash !== undefined) {
    return { ok: false, message: `"${nameClash.name}" is already a supplier.` };
  }

  const [codeClash] = await db.execute<{ name: string }>(sql`
    select name from supplier where code_prefix = ${cleanPrefix}
  `);
  if (codeClash !== undefined) {
    return { ok: false, message: `Code "${cleanPrefix}" is already used by "${codeClash.name}".` };
  }

  await db.execute(sql`
    insert into supplier (name, code_prefix, phone, gstin, address, contact_person)
    values (
      ${cleanName},
      ${cleanPrefix},
      ${draft.phone.trim() || null},
      ${draft.gstin.trim() || null},
      ${draft.address.trim() || null},
      ${draft.contactPerson.trim() || null}
    )
  `);

  revalidate();

  return { ok: true, message: `Added ${cleanName}.` };
}

/**
 * Fixing what was entered. Unlike `createSupplier`, the code and name
 * checks exclude this row itself — otherwise a supplier could never be
 * re-saved without changing its own name or code first.
 */
export async function updateSupplier(supplierId: string, draft: SupplierDraft): Promise<ActionResult> {
  const denied = await guard("floor");
  if (denied !== null) return denied;

  const cleanName = draft.name.trim();
  const cleanPrefix = draft.codePrefix.trim().toUpperCase();

  if (cleanName === "") {
    return { ok: false, message: "Name is required." };
  }
  if (cleanPrefix === "" || !/^[A-Z]{1,4}$/.test(cleanPrefix)) {
    return { ok: false, message: "Code must be 1 to 4 letters, like A or GJ." };
  }

  const [nameClash] = await db.execute<{ name: string }>(sql`
    select name from supplier where lower(name) = lower(${cleanName}) and id <> ${supplierId}
  `);
  if (nameClash !== undefined) {
    return { ok: false, message: `"${nameClash.name}" is already a supplier.` };
  }

  const [codeClash] = await db.execute<{ name: string }>(sql`
    select name from supplier where code_prefix = ${cleanPrefix} and id <> ${supplierId}
  `);
  if (codeClash !== undefined) {
    return { ok: false, message: `Code "${cleanPrefix}" is already used by "${codeClash.name}".` };
  }

  const [row] = await db.execute<{ name: string }>(sql`
    update supplier
    set
      name = ${cleanName},
      code_prefix = ${cleanPrefix},
      phone = ${draft.phone.trim() || null},
      gstin = ${draft.gstin.trim() || null},
      address = ${draft.address.trim() || null},
      contact_person = ${draft.contactPerson.trim() || null},
      updated_at = now()
    where id = ${supplierId}
    returning name
  `);

  if (row === undefined) {
    return { ok: false, message: "That supplier no longer exists." };
  }

  revalidate();

  return { ok: true, message: `${row.name} updated.` };
}

/**
 * Active/inactive rather than delete — a supplier already on bales can't be
 * erased without erasing their history, and staff still need to look them
 * up. Only the Bale Intake dropdown reads this; every existing bale is
 * unaffected either way.
 */
export async function setSupplierStatus(supplierId: string, status: "active" | "inactive"): Promise<ActionResult> {
  const denied = await guard("floor");
  if (denied !== null) return denied;

  const [row] = await db.execute<{ name: string }>(sql`
    update supplier set status = ${status}, updated_at = now() where id = ${supplierId} returning name
  `);

  if (row === undefined) {
    return { ok: false, message: "That supplier no longer exists." };
  }

  revalidate();

  return { ok: true, message: `${row.name} marked ${status}.` };
}

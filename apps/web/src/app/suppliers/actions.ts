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
  revalidatePath("/suppliers");
  // The bale form's dropdown reads from the same list.
  revalidatePath("/bales");
}

export async function createSupplier(name: string, codePrefix: string): Promise<ActionResult> {
  const denied = await guard("floor");
  if (denied !== null) return denied;

  const cleanName = name.trim();
  const cleanPrefix = codePrefix.trim().toUpperCase();

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
    insert into supplier (name, code_prefix) values (${cleanName}, ${cleanPrefix})
  `);

  revalidate();

  return { ok: true, message: `Added ${cleanName}.` };
}

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
  revalidatePath("/job-roles");
  // The staff form's role picker reads from the same list.
  revalidatePath("/staff");
}

/**
 * Who defines job functions — owners, the same as who manages staff.
 * Unlike Suppliers or Cloth Items, this isn't floor-level data entry;
 * it's the shape of who's responsible for what.
 */
export async function createJobRole(name: string): Promise<ActionResult> {
  const denied = await guard("owner");
  if (denied !== null) return denied;

  const cleanName = name.trim();
  if (cleanName === "") {
    return { ok: false, message: "Name is required." };
  }

  const [clash] = await db.execute<{ name: string }>(sql`
    select name from job_role where lower(name) = lower(${cleanName})
  `);
  if (clash !== undefined) {
    return { ok: false, message: `"${clash.name}" is already on the list.` };
  }

  await db.execute(sql`
    insert into job_role (name) values (${cleanName})
  `);

  revalidate();

  return { ok: true, message: `Added ${cleanName}.` };
}

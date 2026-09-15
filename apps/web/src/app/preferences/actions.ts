"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { parsePreferences, type Preferences } from "@/lib/preferences";
import { actingId, guard } from "@/lib/session";

export interface ActionResult {
  ok: boolean;
  message: string;
}

/**
 * Merges `patch` into whatever this signed-in person already has, rather
 * than replacing the whole bucket — so setting the page size doesn't
 * silently reset their theme, which the caller almost never means to touch.
 */
export async function updatePreferences(patch: Partial<Preferences>): Promise<ActionResult> {
  const denied = await guard("floor");
  if (denied !== null) return denied;

  const actorId = await actingId();
  if (actorId === null) return { ok: false, message: "Not signed in." };

  const [row] = await db.execute<{ preferences: unknown }>(sql`
    select preferences from actor where id = ${actorId}
  `);
  const next = { ...parsePreferences(row?.preferences), ...patch };

  await db.execute(sql`
    update actor set preferences = ${JSON.stringify(next)}::jsonb, updated_at = now()
    where id = ${actorId}
  `);

  // The whole shell reads preferences once, in the root layout — this is
  // the one path that changed them, so it's the one path that has to say so.
  revalidatePath("/", "layout");

  return { ok: true, message: "Preferences updated." };
}

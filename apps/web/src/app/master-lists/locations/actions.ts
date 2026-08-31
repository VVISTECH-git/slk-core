"use server";

import { eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { location } from "@slk/db";
import { titleCase } from "@slk/domain";

import { db } from "@/lib/db";

import type { ActionResult } from "../actions";

/**
 * Every action here is an untrusted entry point — a Server Action is
 * reachable by POST whether or not the UI rendered the control — so each one
 * re-reads what it is about to touch and re-checks the rule.
 */

function slugify(name: string): string {
  return name
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function revalidate() {
  revalidatePath("/master-lists");
  revalidatePath("/master-lists/locations");
  // The Stock tab picks locations from this list.
  revalidatePath("/records");
}

export interface LocationPatch {
  name?: string;
  isInternal?: boolean;
  isActive?: boolean;
}

export async function saveLocation(
  locationId: string,
  patch: LocationPatch,
): Promise<ActionResult> {
  const [current] = await db
    .select()
    .from(location)
    .where(eq(location.id, locationId));

  if (current === undefined) {
    return { ok: false, message: "That location no longer exists." };
  }

  const set: Record<string, unknown> = {};

  if (patch.name !== undefined) {
    const name = titleCase(patch.name.trim());
    if (name === "") return { ok: false, message: "A location needs a name." };

    const [clash] = await db
      .select({ name: location.name })
      .from(location)
      .where(
        sql`${ne(location.id, locationId)} and lower(${location.name}) = lower(${name})`,
      );

    if (clash !== undefined) {
      return { ok: false, message: `"${clash.name}" already exists.` };
    }

    set["name"] = name;
  }

  if (patch.isInternal !== undefined && patch.isInternal !== current.isInternal) {
    // Internal or external is not a label — it is the arithmetic. On hand is
    // internal minus external, so flipping this on a location that already
    // has history silently rewrites what every past movement meant: stock
    // that was ours becomes stock that never was, and the totals move with
    // no movement recorded. A new location can be either; one with history
    // cannot change.
    const [used] = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from movement
      where from_location_id = ${locationId} or to_location_id = ${locationId}
    `);

    if ((used?.n ?? 0) > 0) {
      return {
        ok: false,
        message: `${used?.n} movement${used?.n === 1 ? "" : "s"} already reference "${current.name}". Changing internal to external would rewrite what those movements meant. Create a new location instead.`,
      };
    }

    set["isInternal"] = patch.isInternal;
  }

  if (patch.isActive !== undefined) set["isActive"] = patch.isActive;

  if (Object.keys(set).length === 0) {
    return { ok: true, message: "Nothing to change." };
  }

  await db.update(location).set(set).where(eq(location.id, locationId));

  revalidate();

  return { ok: true, message: `Saved "${set["name"] ?? current.name}".` };
}

export async function createLocation(
  name: string,
  isInternal: boolean,
): Promise<ActionResult> {
  const clean = titleCase(name.trim());
  if (clean === "" || slugify(clean) === "") {
    return { ok: false, message: "That is not a usable name." };
  }

  const code = slugify(clean);

  const existing = await db
    .select({ code: location.code, name: location.name })
    .from(location)
    .where(sql`${location.code} = ${code} or lower(${location.name}) = lower(${clean})`);

  if (existing[0] !== undefined) {
    return { ok: false, message: `"${existing[0].name}" already exists.` };
  }

  const [next] = await db
    .select({ max: sql<number>`coalesce(max(${location.sortOrder}), -1)::int` })
    .from(location);

  await db.insert(location).values({
    code,
    name: clean,
    isInternal,
    // Internal locations sort above external ones, which is the order they
    // are chosen in.
    sortOrder: (next?.max ?? -1) + 1,
  });

  revalidate();

  return {
    ok: true,
    message: `Added "${clean}" as ${isInternal ? "somewhere we hold stock" : "somewhere stock goes when it leaves"}.`,
  };
}

/**
 * Removes a location outright.
 *
 * Only when no movement has ever touched it. A location that has history is
 * part of how past counts are explained, so it is deactivated rather than
 * deleted — the same reason a used vocabulary value is retired.
 */
export async function deleteLocation(locationId: string): Promise<ActionResult> {
  const [current] = await db
    .select()
    .from(location)
    .where(eq(location.id, locationId));

  if (current === undefined) {
    return { ok: false, message: "That location no longer exists." };
  }

  const [used] = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from movement
    where from_location_id = ${locationId} or to_location_id = ${locationId}
  `);

  if ((used?.n ?? 0) > 0) {
    return {
      ok: false,
      message: `${used?.n} movement${used?.n === 1 ? "" : "s"} reference "${current.name}". Deactivate it instead — it stops being offered and the history still reads.`,
    };
  }

  await db.delete(location).where(eq(location.id, locationId));

  revalidate();

  return { ok: true, message: `Deleted "${current.name}".` };
}

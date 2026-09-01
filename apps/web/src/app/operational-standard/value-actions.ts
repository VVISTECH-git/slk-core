"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { lookupList, lookupValue } from "@slk/db";
import { titleCase } from "@slk/domain";

import { db } from "@/lib/db";

import type { Result } from "./actions";

/**
 * What a category is, beyond its name and its status.
 *
 * These came from the Master Lists screen, which asked the same questions
 * about the same rows one list at a time. That screen is gone and Operational
 * Standard is the one place the vocabulary is maintained, so the work that
 * only lived there — defaults, the review flag, merging two values that were
 * always the same thing, and pasting a column in from a spreadsheet — moved
 * here rather than being lost with it.
 *
 * Every action is an untrusted entry point: a Server Action is reachable by
 * POST whether or not the UI rendered the control. Each one re-reads what it
 * is about to touch and re-checks the rule.
 */

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function revalidate() {
  revalidatePath("/operational-standard");
  // Retiring a value, or making one the default, changes what the record
  // editor offers and what a new record starts with.
  revalidatePath("/records");
}

/* ----------------------------------------------------------- the default */
export async function setDefaultValue(
  valueId: string,
  makeDefault: boolean,
): Promise<Result> {
  const [value] = await db
    .select({
      id: lookupValue.id,
      label: lookupValue.label,
      listId: lookupValue.listId,
      listCode: lookupList.code,
      status: lookupValue.status,
    })
    .from(lookupValue)
    .innerJoin(lookupList, eq(lookupList.id, lookupValue.listId))
    .where(eq(lookupValue.id, valueId));

  if (value === undefined) return { ok: false, message: "No such value." };

  if (makeDefault && value.status !== "active") {
    return {
      ok: false,
      message: `"${value.label}" is ${value.status} — only an Active value can be what new records start with.`,
    };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(lookupValue)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(
        and(
          eq(lookupValue.listId, value.listId),
          eq(lookupValue.isDefault, true),
        ),
      );

    if (makeDefault) {
      await tx
        .update(lookupValue)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(lookupValue.id, valueId));
    }
  });

  revalidate();

  return {
    ok: true,
    message: makeDefault
      ? `New records start with "${value.label}".`
      : `"${value.label}" is no longer the default.`,
  };
}

/* ------------------------------------------------------------ the review */
export async function clearReview(valueIds: string[]): Promise<Result> {
  if (valueIds.length === 0) return { ok: false, message: "Nothing selected." };

  const updated = await db
    .update(lookupValue)
    .set({ needsReview: false, updatedAt: new Date() })
    .where(inArray(lookupValue.id, valueIds))
    .returning({ id: lookupValue.id });

  revalidate();

  const n = updated.length;
  return { ok: true, message: `${n} value${n === 1 ? "" : "s"} marked as checked.` };
}

/* -------------------------------------------------------------------- usage */

async function referencingColumns(): Promise<
  { table: string; column: string }[]
> {
  const rows = await db.execute<{ table: string; column: string }>(sql`
    select
      con.conrelid::regclass::text as table,
      att.attname                  as column
    from pg_constraint con
    join pg_attribute att
      on att.attrelid = con.conrelid
     and att.attnum = con.conkey[1]
    where con.contype = 'f'
      and con.confrelid = 'lookup_value'::regclass
    order by 1, 2
  `);

  return rows;
}

/**
 * An id list as separate bound parameters.
 *
 * Not `= any($1)`: Drizzle binds a JavaScript array as one parameter and
 * Postgres then reads the first uuid as a malformed array literal.
 */
function idList(ids: string[]) {
  return sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );
}

export async function countUsage(
  valueIds: string[],
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const id of valueIds) counts[id] = 0;

  if (valueIds.length === 0) return counts;

  const ids = idList(valueIds);

  for (const { table, column } of await referencingColumns()) {
    // `parent_value_id` is the vocabulary describing itself, not a record
    // using the value, so it does not count as usage.
    if (table === "lookup_value") continue;

    const rows = await db.execute<{ id: string; n: number }>(sql`
      select ${sql.identifier(column)} as id, count(*)::int as n
      from ${sql.identifier(table)}
      where ${sql.identifier(column)} in (${ids})
      group by 1
    `);

    for (const row of rows) counts[row.id] = (counts[row.id] ?? 0) + row.n;
  }

  return counts;
}

/* ----------------------------------------------------------------- merge */
/**
 * Folds one or more values into a survivor.
 *
 * This is what half the Correction Log is: Kanchi into Kanchipuram, Crepe silk
 * into Crepe, Fabric Painting into Hand Painting.
 *
 * Merging means the two were always the same thing, so every record pointing
 * at a losing value is repointed at the survivor before it is removed. Doing
 * it any other way either orphans records or trips a foreign key.
 */
export async function mergeValues(
  survivorId: string,
  mergedIds: string[],
): Promise<Result> {
  if (mergedIds.length === 0) return { ok: false, message: "Nothing to merge." };
  if (mergedIds.includes(survivorId)) {
    return { ok: false, message: "A value cannot be merged into itself." };
  }

  const rows = await db
    .select()
    .from(lookupValue)
    .where(inArray(lookupValue.id, [survivorId, ...mergedIds]));

  const survivor = rows.find((r) => r.id === survivorId);
  if (survivor === undefined) return { ok: false, message: "No such value." };

  const merged = rows.filter((r) => mergedIds.includes(r.id));
  if (merged.length !== mergedIds.length) {
    return { ok: false, message: "Some of those values no longer exist." };
  }

  if (merged.some((m) => m.listId !== survivor.listId)) {
    return {
      ok: false,
      message: "Values can only be merged within the same list.",
    };
  }

  const columns = await referencingColumns();
  const ids = idList(mergedIds);
  let moved = 0;

  await db.transaction(async (tx) => {
    for (const { table, column } of columns) {
      // RETURNING so the row count is real — an UPDATE without it reports
      // nothing, and "0 records moved" on a merge that moved twelve is worse
      // than saying nothing at all.
      const updated = await tx.execute(sql`
        update ${sql.identifier(table)}
        set ${sql.identifier(column)} = ${survivorId}
        where ${sql.identifier(column)} in (${ids})
        returning 1
      `);

      // Self-references are the vocabulary's own parent links, not records.
      if (table !== "lookup_value") moved += updated.length;
    }

    await tx.delete(lookupValue).where(inArray(lookupValue.id, mergedIds));
  });

  revalidate();

  const names = merged.map((m) => `"${m.label}"`).join(", ");

  return {
    ok: true,
    message:
      `Merged ${names} into "${survivor.label}".` +
      (moved > 0 ? ` ${moved} record${moved === 1 ? "" : "s"} moved across.` : ""),
  };
}

/**
 * Removes a value outright.
 *
 * Only when nothing points at it. Retiring is the right answer for a value
 * that has been used and is no longer offered — the records that carry it
 * still need it to mean something. A typo is different: it was never a real
 * value, and leaving it struck through in the list forever is just clutter.
 */

/* ----------------------------------------------------------------- paste */
export interface PastePreview {
  listCode: string;
  fresh: string[];
  existing: string[];
  caseOnly: { pasted: string; stored: string }[];
}

/**
 * Reads a column pasted out of a spreadsheet and says what it would do,
 * before doing it. The vocabulary came from a workbook and will keep arriving
 * that way; retyping thirty values one at a time is the thing this replaces.
 */
export async function previewPaste(
  listCode: string,
  text: string,
): Promise<PastePreview | Result> {
  const [list] = await db
    .select()
    .from(lookupList)
    .where(eq(lookupList.code, listCode));

  if (list === undefined) return { ok: false, message: "No such list." };

  const stored = await db
    .select({ label: lookupValue.label })
    .from(lookupValue)
    .where(eq(lookupValue.listId, list.id));

  const byLower = new Map(stored.map((s) => [s.label.toLowerCase(), s.label]));

  const pasted = [
    ...new Set(
      text
        .split(/[\r\n\t]+/)
        .map((line) => line.trim())
        .filter((line) => line !== ""),
    ),
  ].map((line) => titleCase(line));

  const fresh: string[] = [];
  const existing: string[] = [];
  const caseOnly: { pasted: string; stored: string }[] = [];

  for (const line of pasted) {
    const match = byLower.get(line.toLowerCase());

    if (match === undefined) fresh.push(line);
    else if (match === line) existing.push(line);
    else caseOnly.push({ pasted: line, stored: match });
  }

  return { listCode, fresh, existing, caseOnly };
}

export async function commitPaste(
  listCode: string,
  labels: string[],
): Promise<Result> {
  if (labels.length === 0) return { ok: false, message: "Nothing to add." };

  const [list] = await db
    .select()
    .from(lookupList)
    .where(eq(lookupList.code, listCode));

  if (list === undefined) return { ok: false, message: "No such list." };

  const [next] = await db
    .select({ max: sql<number>`coalesce(max(${lookupValue.sortOrder}), -1)::int` })
    .from(lookupValue)
    .where(eq(lookupValue.listId, list.id));

  let order = (next?.max ?? -1) + 1;

  const rows = labels
    .map((raw) => titleCase(raw.trim()))
    .filter((label) => label !== "" && slugify(label) !== "")
    .map((label) => ({
      listId: list.id,
      code: slugify(label),
      label,
      sortOrder: order++,
    }));

  if (rows.length === 0) {
    return { ok: false, message: "None of those are usable values." };
  }

  await db.insert(lookupValue).values(rows).onConflictDoNothing();

  revalidate();

  return {
    ok: true,
    message: `Added ${rows.length} value${rows.length === 1 ? "" : "s"} to ${list.label}.`,
  };
}

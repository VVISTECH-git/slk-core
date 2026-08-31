"use server";

import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { lookupList, lookupValue } from "@slk/db";
import { titleCase } from "@slk/domain";

import { db } from "@/lib/db";

/**
 * Every value is stored the way it should read: Init Caps, whatever was
 * typed.
 *
 * The workbook keeps `colour` and `descriptor` in lower case, and the
 * database used to match it. That leaked — the same value read Contrast on
 * one screen and contrast on another, and a value typed into any other list
 * was stored exactly as typed, so "dfdf" stayed "dfdf". One rule applied at
 * the point of writing is simpler than two conventions reconciled at every
 * point of reading.
 */

/**
 * Every action is an untrusted entry point — a Server Action is reachable by
 * POST whether or not the UI rendered the control. So each one re-reads what
 * it is about to touch and re-checks the rule, and none of them trust that
 * the client only sent what the client was offered.
 */

export interface ActionResult {
  ok: boolean;
  message: string;
}

/** One row's worth of pending change. Absent fields mean "leave alone". */
export interface ValueEdit {
  id: string;
  label?: string;
  listCode?: string;
  isActive?: boolean;
  clearFlags?: boolean;
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Applies a batch of edits in one transaction.
 *
 * All-or-nothing on purpose: someone renaming eight values in one pass should
 * not end up with three applied and five rejected, having to work out which.
 */
export async function applyEdits(edits: ValueEdit[]): Promise<ActionResult> {
  if (edits.length === 0) return { ok: true, message: "Nothing to save." };
  if (edits.length > 500) {
    return { ok: false, message: "Too many changes at once — save in batches." };
  }

  const ids = edits.map((e) => e.id);

  const rows = await db
    .select({
      id: lookupValue.id,
      label: lookupValue.label,
      listId: lookupValue.listId,
      listCode: lookupList.code,
      lowercase: lookupList.lowercaseValues,
    })
    .from(lookupValue)
    .innerJoin(lookupList, eq(lookupList.id, lookupValue.listId))
    .where(inArray(lookupValue.id, ids));

  const current = new Map(rows.map((r) => [r.id, r]));

  if (current.size !== new Set(ids).size) {
    return { ok: false, message: "Some of those values no longer exist. Reload and try again." };
  }

  const lists = await db.select().from(lookupList);
  const listByCode = new Map(lists.map((l) => [l.code, l]));

  // Validate everything before writing anything.
  const planned: {
    id: string;
    label: string;
    code: string;
    listId: string;
    isActive?: boolean;
    clearFlags: boolean;
  }[] = [];

  // Labels claimed within this batch, so two renames cannot collide with
  // each other as well as with what is already stored.
  const claimed = new Set<string>();

  for (const edit of edits) {
    const row = current.get(edit.id);
    if (row === undefined) continue;

    const targetList =
      edit.listCode === undefined ? null : listByCode.get(edit.listCode);

    if (edit.listCode !== undefined && targetList === undefined) {
      return { ok: false, message: `No list called "${edit.listCode}".` };
    }

    const listId = targetList?.id ?? row.listId;

    const raw = (edit.label ?? row.label).trim();
    if (raw === "") {
      return { ok: false, message: `"${row.label}" cannot be left blank.` };
    }

    const label = titleCase(raw);
    const key = `${listId}::${label.toLowerCase()}`;

    if (claimed.has(key)) {
      return { ok: false, message: `Two of these changes both produce "${label}".` };
    }
    claimed.add(key);

    const clash = await db
      .select({ label: lookupValue.label })
      .from(lookupValue)
      .where(
        and(
          eq(lookupValue.listId, listId),
          ne(lookupValue.id, edit.id),
          sql`lower(${lookupValue.label}) = lower(${label})`,
        ),
      );

    if (clash[0] !== undefined) {
      return {
        ok: false,
        message: `"${clash[0].label}" is already in that list. Merge them instead of renaming.`,
      };
    }

    // Retiring a parent would strand its children on a value that is no
    // longer offered.
    if (edit.isActive === false) {
      const [children] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(lookupValue)
        .where(
          and(
            eq(lookupValue.parentValueId, edit.id),
            eq(lookupValue.isActive, true),
          ),
        );

      if ((children?.n ?? 0) > 0) {
        return {
          ok: false,
          message: `${children?.n} value${children?.n === 1 ? "" : "s"} still belong to "${row.label}".`,
        };
      }
    }

    planned.push({
      id: edit.id,
      label,
      // The code is frozen at creation. Records hold onto it and design codes
      // printed on QR labels are built from it, so a rename must not move it.
      // Only a move to another list needs a fresh one, and only if it clashes.
      code: row.listId === listId ? "" : slugify(label),
      listId,
      isActive: edit.isActive,
      clearFlags: edit.clearFlags ?? false,
    });
  }

  await db.transaction(async (tx) => {
    for (const p of planned) {
      await tx
        .update(lookupValue)
        .set({
          label: p.label,
          listId: p.listId,
          ...(p.code === "" ? {} : { code: p.code }),
          ...(p.isActive === undefined ? {} : { isActive: p.isActive }),
          ...(p.clearFlags ? { isProposed: false, needsReview: false } : {}),
          updatedAt: new Date(),
        })
        .where(eq(lookupValue.id, p.id));
    }
  });

  revalidatePath("/master-lists");

  return {
    ok: true,
    message: `Saved ${planned.length} change${planned.length === 1 ? "" : "s"}.`,
  };
}

/**
 * Every column in the database that points at a lookup value.
 *
 * Read from Postgres's own catalogue rather than listed by hand: `design`
 * alone has twenty-odd of them, and a merge that missed one would fail at the
 * foreign key with a stack trace instead of doing the job. New tables that
 * reference the vocabulary are picked up here without anyone remembering to
 * add them.
 */
async function referencingColumns(): Promise<
  { table: string; column: string }[]
> {
  return db.execute<{ table: string; column: string }>(sql`
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

/** How many rows across the whole database point at each of these values. */
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

    for (const row of rows) {
      counts[row.id] = (counts[row.id] ?? 0) + row.n;
    }
  }

  return counts;
}

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
): Promise<ActionResult> {
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
      message: "Values can only be merged within the same list. Move them first.",
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

  revalidatePath("/master-lists");
  revalidatePath("/records");

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
export async function deleteValue(valueId: string): Promise<ActionResult> {
  const rows = await db
    .select()
    .from(lookupValue)
    .where(eq(lookupValue.id, valueId));

  const value = rows[0];
  if (value === undefined) return { ok: false, message: "No such value." };

  const usage = (await countUsage([valueId]))[valueId] ?? 0;

  if (usage > 0) {
    return {
      ok: false,
      message: `${usage} record${usage === 1 ? "" : "s"} use "${value.label}". Retire it instead — they keep the value, and it stops being offered.`,
    };
  }

  const [children] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(lookupValue)
    .where(eq(lookupValue.parentValueId, valueId));

  if ((children?.n ?? 0) > 0) {
    return {
      ok: false,
      message: `${children?.n} value${children?.n === 1 ? "" : "s"} belong to "${value.label}". Move them first.`,
    };
  }

  await db.delete(lookupValue).where(eq(lookupValue.id, valueId));

  revalidatePath("/master-lists");

  return { ok: true, message: `Deleted "${value.label}".` };
}

/**
 * Makes one value the list's default, or clears it.
 *
 * The old default is cleared in the same transaction — a partial unique index
 * allows only one per list, so setting a second without clearing the first
 * would be refused rather than quietly leaving two.
 */
export async function setDefaultValue(
  valueId: string,
  makeDefault: boolean,
): Promise<ActionResult> {
  const rows = await db
    .select()
    .from(lookupValue)
    .where(eq(lookupValue.id, valueId));

  const value = rows[0];
  if (value === undefined) return { ok: false, message: "No such value." };

  if (makeDefault && !value.isActive) {
    return {
      ok: false,
      message: "A retired value cannot be the default — restore it first.",
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

  revalidatePath("/master-lists");
  revalidatePath("/records");

  return {
    ok: true,
    message: makeDefault
      ? `New records start with "${value.label}".`
      : `"${value.label}" is no longer the default.`,
  };
}

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
): Promise<PastePreview | ActionResult> {
  const list = (
    await db.select().from(lookupList).where(eq(lookupList.code, listCode))
  )[0];

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
): Promise<ActionResult> {
  if (labels.length === 0) return { ok: false, message: "Nothing to add." };

  const list = (
    await db.select().from(lookupList).where(eq(lookupList.code, listCode))
  )[0];

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

  revalidatePath("/master-lists");

  return {
    ok: true,
    message: `Added ${rows.length} value${rows.length === 1 ? "" : "s"} to ${list.label}.`,
  };
}

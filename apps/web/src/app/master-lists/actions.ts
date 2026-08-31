"use server";

import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { lookupList, lookupValue } from "@slk/db";
import { LOOKUP_STATUSES, titleCase, type LookupStatus } from "@slk/domain";

import { db } from "@/lib/db";

/**
 * Every value is stored the way it should read: Init Caps, whatever was
 * typed. One rule applied at the point of writing is simpler than two
 * conventions reconciled at every point of reading.
 *
 * Every action here is an untrusted entry point — a Server Action is
 * reachable by POST whether or not the UI rendered the control. So each one
 * re-reads what it is about to touch and re-checks the rule, and none of them
 * trust that the client only sent what the client was offered.
 */

export interface ActionResult {
  ok: boolean;
  message: string;
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isStatus(value: unknown): value is LookupStatus {
  return (
    typeof value === "string" &&
    (LOOKUP_STATUSES as readonly string[]).includes(value)
  );
}

function revalidate(listCode?: string) {
  revalidatePath("/master-lists");
  if (listCode !== undefined) revalidatePath(`/master-lists/${listCode}`);
  // Retiring a value changes what the record editor offers.
  revalidatePath("/records");
}

/* ------------------------------------------------------------------ values */

export interface ValuePatch {
  label?: string;
  description?: string | null;
  status?: LookupStatus;
  needsReview?: boolean;
  parentId?: string | null;
}

/**
 * Saves one value — the drawer's Save.
 *
 * One value at a time rather than a batch of pending edits. The old screen
 * accumulated drafts across 229 rows and saved them together, which meant a
 * single rejected rename discarded work done on seven other rows.
 */
export async function saveValue(
  valueId: string,
  patch: ValuePatch,
): Promise<ActionResult> {
  const [current] = await db
    .select({
      id: lookupValue.id,
      label: lookupValue.label,
      listId: lookupValue.listId,
      listCode: lookupList.code,
      status: lookupValue.status,
      isDefault: lookupValue.isDefault,
    })
    .from(lookupValue)
    .innerJoin(lookupList, eq(lookupList.id, lookupValue.listId))
    .where(eq(lookupValue.id, valueId));

  if (current === undefined) {
    return { ok: false, message: "That value no longer exists. Reload the page." };
  }

  const set: Record<string, unknown> = { updatedAt: new Date() };

  if (patch.label !== undefined) {
    const label = titleCase(patch.label.trim());

    if (label === "") return { ok: false, message: "A value needs a name." };

    const [clash] = await db
      .select({ label: lookupValue.label })
      .from(lookupValue)
      .where(
        and(
          eq(lookupValue.listId, current.listId),
          ne(lookupValue.id, valueId),
          sql`lower(${lookupValue.label}) = lower(${label})`,
        ),
      );

    if (clash !== undefined) {
      return {
        ok: false,
        message: `"${clash.label}" is already in this list. Merge them instead of renaming.`,
      };
    }

    // The code is frozen at creation. Records hold onto it and design codes
    // printed on QR labels are built from it, so a rename must not move it.
    set["label"] = label;
  }

  if (patch.description !== undefined) {
    const trimmed = patch.description?.trim() ?? "";
    set["description"] = trimmed === "" ? null : trimmed;
  }

  if (patch.needsReview !== undefined) set["needsReview"] = patch.needsReview;

  if (patch.parentId !== undefined) {
    if (patch.parentId === valueId) {
      return { ok: false, message: "A value cannot belong to itself." };
    }

    if (patch.parentId !== null) {
      const [parent] = await db
        .select({ id: lookupValue.id })
        .from(lookupValue)
        .where(eq(lookupValue.id, patch.parentId));

      if (parent === undefined) {
        return { ok: false, message: "That parent value no longer exists." };
      }
    }

    set["parentValueId"] = patch.parentId;
  }

  if (patch.status !== undefined) {
    if (!isStatus(patch.status)) {
      return { ok: false, message: "Unknown status." };
    }

    const blocked = await statusChangeBlocked(
      valueId,
      current.label,
      patch.status,
    );
    if (blocked !== null) return { ok: false, message: blocked };

    set["status"] = patch.status;

    // A value that is no longer offered cannot be what a new record starts
    // with. Clearing it here rather than refusing the change keeps the more
    // deliberate action — retiring — from being blocked by the incidental one.
    if (patch.status !== "active" && current.isDefault) set["isDefault"] = false;
  }

  await db.update(lookupValue).set(set).where(eq(lookupValue.id, valueId));

  revalidate(current.listCode);

  return { ok: true, message: `Saved "${set["label"] ?? current.label}".` };
}

/**
 * Whether moving a value out of Active would strand something.
 *
 * Returns the reason, or null if the change is fine.
 */
async function statusChangeBlocked(
  valueId: string,
  label: string,
  next: LookupStatus,
): Promise<string | null> {
  if (next === "active") return null;

  const [children] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(lookupValue)
    .where(
      and(
        eq(lookupValue.parentValueId, valueId),
        eq(lookupValue.status, "active"),
      ),
    );

  const n = children?.n ?? 0;

  return n === 0
    ? null
    : `${n} value${n === 1 ? "" : "s"} still belong to "${label}". Move them first.`;
}

/** Moves several values at once — the type screen's bulk bar. */
export async function setStatus(
  valueIds: string[],
  status: LookupStatus,
): Promise<ActionResult> {
  if (valueIds.length === 0) return { ok: false, message: "Nothing selected." };
  if (!isStatus(status)) return { ok: false, message: "Unknown status." };

  const rows = await db
    .select({
      id: lookupValue.id,
      label: lookupValue.label,
      listCode: lookupList.code,
    })
    .from(lookupValue)
    .innerJoin(lookupList, eq(lookupList.id, lookupValue.listId))
    .where(inArray(lookupValue.id, valueIds));

  if (rows.length !== new Set(valueIds).size) {
    return { ok: false, message: "Some of those no longer exist. Reload the page." };
  }

  // Checked before anything is written, so the whole batch either applies or
  // is refused with the reason.
  for (const row of rows) {
    const blocked = await statusChangeBlocked(row.id, row.label, status);
    if (blocked !== null) return { ok: false, message: blocked };
  }

  await db
    .update(lookupValue)
    .set({
      status,
      ...(status === "active" ? {} : { isDefault: false }),
      updatedAt: new Date(),
    })
    .where(inArray(lookupValue.id, valueIds));

  revalidate(rows[0]?.listCode);

  const n = rows.length;
  return { ok: true, message: `${n} value${n === 1 ? "" : "s"} moved to ${titleCase(status)}.` };
}

/** Clears the review flag — the inbox's "checked, it's fine". */
export async function clearReview(valueIds: string[]): Promise<ActionResult> {
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

export async function createValue(
  listCode: string,
  label: string,
): Promise<ActionResult & { id?: string }> {
  const [list] = await db
    .select()
    .from(lookupList)
    .where(eq(lookupList.code, listCode));

  if (list === undefined) return { ok: false, message: "No such list." };

  const clean = titleCase(label.trim());
  if (clean === "" || slugify(clean) === "") {
    return { ok: false, message: "That is not a usable value." };
  }

  const [clash] = await db
    .select({ label: lookupValue.label })
    .from(lookupValue)
    .where(
      and(
        eq(lookupValue.listId, list.id),
        sql`lower(${lookupValue.label}) = lower(${clean})`,
      ),
    );

  if (clash !== undefined) {
    return { ok: false, message: `"${clash.label}" is already in this list.` };
  }

  const [next] = await db
    .select({ max: sql<number>`coalesce(max(${lookupValue.sortOrder}), -1)::int` })
    .from(lookupValue)
    .where(eq(lookupValue.listId, list.id));

  const [created] = await db
    .insert(lookupValue)
    .values({
      listId: list.id,
      code: slugify(clean),
      label: clean,
      sortOrder: (next?.max ?? -1) + 1,
    })
    .returning({ id: lookupValue.id });

  revalidate(listCode);

  return { ok: true, message: `Added "${clean}".`, id: created?.id };
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

/* ------------------------------------------------------------ merge, delete */

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
      message: "Values can only be merged within the same list.",
    };
  }

  const [list] = await db
    .select({ code: lookupList.code })
    .from(lookupList)
    .where(eq(lookupList.id, survivor.listId));

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

  revalidate(list?.code);

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
  const [value] = await db
    .select({
      id: lookupValue.id,
      label: lookupValue.label,
      listCode: lookupList.code,
    })
    .from(lookupValue)
    .innerJoin(lookupList, eq(lookupList.id, lookupValue.listId))
    .where(eq(lookupValue.id, valueId));

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

  revalidate(value.listCode);

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

  revalidate(value.listCode);

  return {
    ok: true,
    message: makeDefault
      ? `New records start with "${value.label}".`
      : `"${value.label}" is no longer the default.`,
  };
}

/* --------------------------------------------------------------- the type */

export async function saveList(
  listCode: string,
  patch: { label?: string; description?: string | null },
): Promise<ActionResult> {
  const [list] = await db
    .select()
    .from(lookupList)
    .where(eq(lookupList.code, listCode));

  if (list === undefined) return { ok: false, message: "No such list." };

  const set: Record<string, unknown> = { updatedAt: new Date() };

  if (patch.label !== undefined) {
    const label = titleCase(patch.label.trim());
    if (label === "") return { ok: false, message: "A list needs a name." };

    const [clash] = await db
      .select({ label: lookupList.label })
      .from(lookupList)
      .where(
        and(
          ne(lookupList.id, list.id),
          sql`lower(${lookupList.label}) = lower(${label})`,
        ),
      );

    if (clash !== undefined) {
      return { ok: false, message: `Another list is already called "${label}".` };
    }

    set["label"] = label;
  }

  if (patch.description !== undefined) {
    const trimmed = patch.description?.trim() ?? "";
    set["description"] = trimmed === "" ? null : trimmed;
  }

  await db.update(lookupList).set(set).where(eq(lookupList.id, list.id));

  revalidate(listCode);

  return { ok: true, message: "Saved." };
}

/* -------------------------------------------------------------------- paste */

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
): Promise<ActionResult> {
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

  revalidate(listCode);

  return {
    ok: true,
    message: `Added ${rows.length} value${rows.length === 1 ? "" : "s"} to ${list.label}.`,
  };
}

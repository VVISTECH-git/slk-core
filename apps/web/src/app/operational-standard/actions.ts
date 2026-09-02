"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { titleCase } from "@slk/domain";

import { db } from "@/lib/db";

export interface Result {
  ok: boolean;
  message: string;
}

/**
 * Add, change and remove, for both halves of Master Lists.
 *
 * Every one re-reads what it is about to touch. A Server Action is reachable
 * by POST whether or not the screen offered the control, so the rules live
 * here and the UI merely agrees with them.
 */

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function done(): void {
  revalidatePath("/operational-standard");
  revalidatePath("/operational-standard");
  revalidatePath("/records");
}

/* --------------------------------------------------- classifications */

export interface ClassificationPatch {
  name?: string;
  description?: string | null;
  isEnabled?: boolean;
  dependsOnId?: string | null;
  status?: string;
}

export async function saveClassification(
  id: string,
  patch: ClassificationPatch,
): Promise<Result> {
  const [current] = await db.execute<{ label: string; code: string }>(sql`
    select label, code from lookup_list where id = ${id}
  `);

  if (current === undefined) {
    return { ok: false, message: "That classification no longer exists." };
  }

  const set: string[] = [];
  const values: unknown[] = [];

  if (patch.name !== undefined) {
    const name = titleCase(patch.name.trim());
    if (name === "") return { ok: false, message: "A classification needs a name." };

    const [clash] = await db.execute<{ label: string }>(sql`
      select label from lookup_list
      where id <> ${id} and lower(label) = lower(${name})
    `);

    if (clash !== undefined) {
      return { ok: false, message: `Another classification is called "${clash.label}".` };
    }

    set.push("label");
    values.push(name);
  }

  if (patch.description !== undefined) {
    set.push("description");
    const trimmed = patch.description?.trim() ?? "";
    values.push(trimmed === "" ? null : trimmed);
  }

  if (patch.isEnabled !== undefined) {
    set.push("is_enabled");
    values.push(patch.isEnabled);
  }

  if (patch.status !== undefined) {
    if (!["draft", "active", "retired"].includes(patch.status)) {
      return { ok: false, message: "Unknown status." };
    }
    set.push("status");
    values.push(patch.status);
  }

  if (patch.dependsOnId !== undefined) {
    if (patch.dependsOnId === id) {
      return { ok: false, message: "A classification cannot depend on itself." };
    }

    if (patch.dependsOnId !== null) {
      // A depends on B depends on A would make the form ask a question that
      // cannot be answered until it has been answered.
      const [cycle] = await db.execute<{ n: number }>(sql`
        with recursive up as (
          select id, parent_list_id from lookup_list where id = ${patch.dependsOnId}
          union all
          select l.id, l.parent_list_id from lookup_list l join up on up.parent_list_id = l.id
        )
        select count(*)::int as n from up where id = ${id}
      `);

      if ((cycle?.n ?? 0) > 0) {
        return { ok: false, message: "That would make the two depend on each other." };
      }
    }

    set.push("parent_list_id");
    values.push(patch.dependsOnId);
  }

  if (set.length === 0) return { ok: true, message: "Nothing to change." };

  await db.execute(sql`
    update lookup_list set ${sql.join(
      set.map((column, i) => sql`${sql.identifier(column)} = ${values[i]}`),
      sql`, `,
    )}, updated_at = now()
    where id = ${id}
  `);

  done();

  return { ok: true, message: `Saved "${patch.name ?? current.label}".` };
}

export async function addClassification(
  name: string,
  dependsOnId: string | null,
): Promise<Result> {
  const clean = titleCase(name.trim());
  if (clean === "" || slugify(clean) === "") {
    return { ok: false, message: "That is not a usable name." };
  }

  const [clash] = await db.execute<{ label: string }>(sql`
    select label from lookup_list
    where lower(label) = lower(${clean}) or code = ${slugify(clean)}
  `);

  if (clash !== undefined) {
    return { ok: false, message: `"${clash.label}" already exists.` };
  }

  // No sort_order. Classifications read by name, so a new one files itself in
  // the right place; taking max + 1 put every one added here at the bottom of
  // an otherwise alphabetical list and made the order look broken.
  await db.execute(sql`
    insert into lookup_list (code, label, parent_list_id)
    values (${slugify(clean)}, ${clean}, ${dependsOnId})
  `);

  done();

  return { ok: true, message: `Added "${clean}".` };
}

/**
 * Removes classifications outright.
 *
 * Only empty ones, and never a system list. A classification with values is
 * disabled instead — the records carrying those values still need them to
 * mean something.
 */
export async function deleteClassifications(ids: string[]): Promise<Result> {
  if (ids.length === 0) return { ok: false, message: "Nothing selected." };

  const list = sql.join(ids.map((id) => sql`${id}`), sql`, `);

  const [blocked] = await db.execute<{ label: string; why: string }>(sql`
    select l.label,
      case
        when l.is_system then 'the application reads it by code'
        when exists (select 1 from lookup_value v where v.list_id = l.id)
          then 'it still has values'
        when exists (select 1 from lookup_list c where c.parent_list_id = l.id)
          then 'another classification depends on it'
      end as why
    from lookup_list l
    where l.id in (${list})
      and (
        l.is_system
        or exists (select 1 from lookup_value v where v.list_id = l.id)
        or exists (select 1 from lookup_list c where c.parent_list_id = l.id)
      )
    limit 1
  `);

  if (blocked !== undefined) {
    return {
      ok: false,
      message: `"${blocked.label}" cannot be deleted — ${blocked.why}. Disable it instead.`,
    };
  }

  const removed = await db.execute(sql`
    delete from lookup_list where id in (${list}) returning 1
  `);

  done();

  const n = removed.length;
  return { ok: true, message: `Deleted ${n} classification${n === 1 ? "" : "s"}.` };
}

/* --------------------------------------------------------- categories */

export interface CategoryPatch {
  name?: string;
  description?: string | null;
  status?: string;
  belongsToId?: string | null;
  /**
   * Flagged for checking against real stock.
   *
   * Deliberately not a status: a category can need checking while it is
   * draft, proposed or active, and answering the question does not move it
   * along its life.
   */
  needsReview?: boolean;
}

export async function saveCategory(
  id: string,
  patch: CategoryPatch,
): Promise<Result> {
  const [current] = await db.execute<{ label: string; listId: string }>(sql`
    select label, list_id as "listId" from lookup_value where id = ${id}
  `);

  if (current === undefined) {
    return { ok: false, message: "That category no longer exists." };
  }

  const set: string[] = [];
  const values: unknown[] = [];

  if (patch.name !== undefined) {
    const name = titleCase(patch.name.trim());
    if (name === "") return { ok: false, message: "A category needs a name." };

    const [clash] = await db.execute<{ label: string }>(sql`
      select label from lookup_value
      where list_id = ${current.listId} and id <> ${id}
        and lower(label) = lower(${name})
    `);

    if (clash !== undefined) {
      return { ok: false, message: `"${clash.label}" is already in this classification.` };
    }

    set.push("label");
    values.push(name);
  }

  if (patch.description !== undefined) {
    set.push("description");
    const trimmed = patch.description?.trim() ?? "";
    values.push(trimmed === "" ? null : trimmed);
  }

  if (patch.status !== undefined) {
    if (!["draft", "proposed", "active", "retired"].includes(patch.status)) {
      return { ok: false, message: "Unknown status." };
    }
    set.push("status");
    values.push(patch.status);
  }

  if (patch.belongsToId !== undefined) {
    if (patch.belongsToId === id) {
      return { ok: false, message: "A category cannot belong to itself." };
    }
    set.push("parent_value_id");
    values.push(patch.belongsToId);
  }

  if (patch.needsReview !== undefined) {
    set.push("needs_review");
    values.push(patch.needsReview);
  }

  if (set.length === 0) return { ok: true, message: "Nothing to change." };

  await db.execute(sql`
    update lookup_value set ${sql.join(
      set.map((column, i) => sql`${sql.identifier(column)} = ${values[i]}`),
      sql`, `,
    )}, updated_at = now()
    where id = ${id}
  `);

  done();

  return { ok: true, message: `Saved "${patch.name ?? current.label}".` };
}

export async function addCategory(
  classificationId: string,
  name: string,
  belongsToId: string | null,
): Promise<Result> {
  const clean = titleCase(name.trim());
  if (clean === "" || slugify(clean) === "") {
    return { ok: false, message: "That is not a usable name." };
  }

  const [list] = await db.execute<{ label: string }>(sql`
    select label from lookup_list where id = ${classificationId}
  `);

  if (list === undefined) return { ok: false, message: "No such classification." };

  const [clash] = await db.execute<{ label: string }>(sql`
    select label from lookup_value
    where list_id = ${classificationId} and lower(label) = lower(${clean})
  `);

  if (clash !== undefined) {
    return { ok: false, message: `"${clash.label}" is already in ${list.label}.` };
  }

  const [next] = await db.execute<{ max: number }>(sql`
    select coalesce(max(sort_order), -1)::int as max
    from lookup_value where list_id = ${classificationId}
  `);

  await db.execute(sql`
    insert into lookup_value (list_id, code, label, sort_order, parent_value_id)
    values (
      ${classificationId}, ${slugify(clean)}, ${clean},
      ${(next?.max ?? -1) + 1}, ${belongsToId}
    )
  `);

  done();

  return { ok: true, message: `Added "${clean}" to ${list.label}.` };
}

/**
 * Removes categories outright.
 *
 * Only ones nothing points at. A value a record carries is retired instead —
 * that record still needs the word to mean something, which is the whole
 * distinction between retiring and deleting.
 */
export async function deleteCategories(ids: string[]): Promise<Result> {
  if (ids.length === 0) return { ok: false, message: "Nothing selected." };

  const list = sql.join(ids.map((id) => sql`${id}`), sql`, `);

  const columns = await db.execute<{ tbl: string; col: string }>(sql`
    select con.conrelid::regclass::text as tbl, att.attname as col
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f' and con.confrelid = 'lookup_value'::regclass
  `);

  for (const c of columns) {
    const [used] = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from ${sql.identifier(c.tbl)}
      where ${sql.identifier(c.col)} in (${list})
    `);

    if ((used?.n ?? 0) > 0) {
      const what =
        c.tbl === "lookup_value"
          ? "other categories belong to one of those"
          : `${used?.n} record${used?.n === 1 ? "" : "s"} use one of those`;

      return { ok: false, message: `Cannot delete — ${what}. Retire instead.` };
    }
  }

  const removed = await db.execute(sql`
    delete from lookup_value where id in (${list}) returning 1
  `);

  done();

  const n = removed.length;
  return { ok: true, message: `Deleted ${n} categor${n === 1 ? "y" : "ies"}.` };
}

/** Moves several categories at once — the bulk bar's enable and disable. */
export async function setCategoryStatus(
  ids: string[],
  status: string,
): Promise<Result> {
  if (ids.length === 0) return { ok: false, message: "Nothing selected." };
  if (!["draft", "proposed", "active", "retired"].includes(status)) {
    return { ok: false, message: "Unknown status." };
  }

  const updated = await db.execute(sql`
    update lookup_value
    set status = ${status},
        is_default = case when ${status} = 'active' then is_default else false end,
        updated_at = now()
    where id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
    returning 1
  `);

  done();

  const n = updated.length;
  return { ok: true, message: `${n} categor${n === 1 ? "y" : "ies"} set to ${titleCase(status)}.` };
}

/** Enable or disable several classifications at once. */
export async function setClassificationEnabled(
  ids: string[],
  isEnabled: boolean,
): Promise<Result> {
  if (ids.length === 0) return { ok: false, message: "Nothing selected." };

  const updated = await db.execute(sql`
    update lookup_list
    set is_enabled = ${isEnabled},
        status = ${isEnabled ? "active" : "retired"},
        updated_at = now()
    where id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
    returning 1
  `);

  done();

  const n = updated.length;
  return {
    ok: true,
    message: `${n} classification${n === 1 ? "" : "s"} ${isEnabled ? "enabled" : "disabled"}.`,
  };
}

import { asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { lookupList, lookupValue } from "@slk/db";
import { findDuplicates, type DuplicateHint, type LookupStatus } from "@slk/domain";

import { db } from "@/lib/db";

/**
 * Master Lists reads as three levels — the directory of types, one type's
 * values, and one value — so this loads at three grains rather than pulling
 * every value on every screen. The directory needs counts, not labels; the
 * type screen needs one list's values; the search box needs both.
 */

export interface VocabValue {
  id: string;
  code: string;
  label: string;
  description: string | null;
  listCode: string;
  listLabel: string;
  status: LookupStatus;
  isDefault: boolean;
  needsReview: boolean;
  parentId: string | null;
  parentLabel: string | null;
  hex: string | null;
  isColour: boolean;
  usage: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * A type's health, computed rather than stored.
 *
 * A status column that is not derived from something specific becomes
 * decoration — a green dot meaning "nothing came to mind".
 *
 * "No default" was the fourth state here and has been removed, because it was
 * true of 38 of the 41 lists: most of them *should* have no default. Nothing
 * sensible pre-fills Colour or Motif. A signal that fires on nearly every row
 * is not a signal, and it was crowding out the two that matter.
 */
export type ListHealth = "empty" | "review" | "retired" | "healthy";

/**
 * Whether this list's values are colours, and so want a swatch.
 *
 * `colourSwatch` answers "what colour is this word" with a grey when it does
 * not know, which is right in a colour column and wrong everywhere else —
 * applied to every list it puts a meaningless dot beside Ajrakh and 3D Print.
 * Deciding by list rather than by label is what stops that: whether a value
 * is a colour is a fact about the column it lives in.
 */
function isColourList(code: string): boolean {
  return /colou?rs?$/.test(code);
}

export interface VocabList {
  id: string;
  code: string;
  label: string;
  isColour: boolean;
  description: string | null;
  isSystem: boolean;
  total: number;
  active: number;
  attention: number;
  defaultLabel: string | null;
  health: ListHealth;
}

export type VocabDuplicate = DuplicateHint<VocabValue>;

export function duplicatesFor(values: VocabValue[]): VocabDuplicate[] {
  return findDuplicates(values);
}

function hexOf(meta: unknown): string | null {
  return typeof meta === "object" &&
    meta !== null &&
    "hex" in meta &&
    typeof (meta as { hex: unknown }).hex === "string"
    ? (meta as { hex: string }).hex
    : null;
}

/**
 * Every column in the database that points at a lookup value, read from
 * Postgres's own catalogue. `design` alone has twenty-odd, and a count that
 * missed one would report a value as unused when a record is holding it.
 */
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

  // `parent_value_id` is the vocabulary describing itself, not a record using
  // the value.
  return rows.filter((r) => r.table !== "lookup_value");
}

/**
 * How many records point at each value in one list.
 *
 * One query per referencing table, grouped — not one per value. The type
 * screen shows usage on every row, and a per-value count would be a few
 * hundred round trips to render a page.
 */
async function usageByValue(listId: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>();

  for (const { table, column } of await referencingColumns()) {
    const rows = await db.execute<{ id: string; n: number }>(sql`
      select v.id, count(t.*)::int as n
      from lookup_value v
      join ${sql.identifier(table)} t on t.${sql.identifier(column)} = v.id
      where v.list_id = ${listId}
      group by 1
    `);

    for (const row of rows) {
      counts.set(row.id, (counts.get(row.id) ?? 0) + row.n);
    }
  }

  return counts;
}

/** The directory: every type with the numbers the row needs, and nothing else. */
export async function loadLists(): Promise<VocabList[]> {
  const rows = await db.execute<{
    id: string;
    code: string;
    label: string;
    description: string | null;
    is_system: boolean;
    total: number;
    active: number;
    attention: number;
    default_label: string | null;
  }>(sql`
    select
      l.id, l.code, l.label, l.description, l.is_system,
      count(v.id)::int                                        as total,
      count(v.id) filter (where v.status = 'active')::int      as active,
      count(v.id) filter (
        where v.needs_review or v.status in ('draft', 'proposed')
      )::int                                                   as attention,
      max(v.label) filter (where v.is_default)                 as default_label
    from lookup_list l
    left join lookup_value v on v.list_id = l.id
    group by l.id
    order by l.sort_order, l.label
  `);

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    label: r.label,
    isColour: isColourList(r.code),
    description: r.description,
    isSystem: r.is_system,
    total: r.total,
    active: r.active,
    attention: r.attention,
    defaultLabel: r.default_label,
    health:
      r.total === 0
        ? "empty"
        : r.attention > 0
          ? "review"
          : // Values, but none of them offered any more. Border Style reads
            // "0 of 4 active" — calling that Healthy would be the green dot
            // meaning "nothing came to mind" all over again.
            r.active === 0
            ? "retired"
            : "healthy",
  }));
}

/** One type and its values, with usage counts and duplicate hints. */
export async function loadList(code: string): Promise<{
  list: VocabList;
  values: VocabValue[];
  duplicates: VocabDuplicate[];
} | null> {
  const lists = await loadLists();
  const list = lists.find((l) => l.code === code);
  if (list === undefined) return null;

  const parent = alias(lookupValue, "parent");

  const rows = await db
    .select({
      id: lookupValue.id,
      code: lookupValue.code,
      label: lookupValue.label,
      description: lookupValue.description,
      status: lookupValue.status,
      isDefault: lookupValue.isDefault,
      needsReview: lookupValue.needsReview,
      meta: lookupValue.meta,
      parentId: lookupValue.parentValueId,
      parentLabel: parent.label,
      createdAt: lookupValue.createdAt,
      updatedAt: lookupValue.updatedAt,
    })
    .from(lookupValue)
    .leftJoin(parent, eq(parent.id, lookupValue.parentValueId))
    .where(eq(lookupValue.listId, list.id))
    .orderBy(asc(lookupValue.sortOrder), asc(lookupValue.label));

  const usage = await usageByValue(list.id);

  const values: VocabValue[] = rows.map((r) => ({
    id: r.id,
    code: r.code,
    label: r.label,
    description: r.description,
    listCode: list.code,
    listLabel: list.label,
    status: r.status,
    isDefault: r.isDefault,
    needsReview: r.needsReview,
    parentId: r.parentId,
    parentLabel: r.parentLabel,
    isColour: list.isColour,
    hex: hexOf(r.meta),
    usage: usage.get(r.id) ?? 0,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  return { list, values, duplicates: findDuplicates(values) };
}

/**
 * Every value, flat, for search and for the maintenance inbox.
 *
 * The type-first hierarchy is the right structure and it costs one thing: you
 * can no longer see across types at a glance. That matters here more than it
 * would elsewhere — typing "zari" turns up Zari (Border Style), Zari Work
 * (Craft Technique) and Zari Pallu (Pallu Design), and collisions like that
 * are exactly what the Correction Log is full of. The hierarchy organises;
 * this keeps the cross-cutting view it would otherwise cost.
 */
export async function loadAllValues(): Promise<VocabValue[]> {
  const parent = alias(lookupValue, "parent");

  const rows = await db
    .select({
      id: lookupValue.id,
      code: lookupValue.code,
      label: lookupValue.label,
      description: lookupValue.description,
      status: lookupValue.status,
      isDefault: lookupValue.isDefault,
      needsReview: lookupValue.needsReview,
      meta: lookupValue.meta,
      parentId: lookupValue.parentValueId,
      parentLabel: parent.label,
      createdAt: lookupValue.createdAt,
      updatedAt: lookupValue.updatedAt,
      listCode: lookupList.code,
      listLabel: lookupList.label,
    })
    .from(lookupValue)
    .innerJoin(lookupList, eq(lookupList.id, lookupValue.listId))
    .leftJoin(parent, eq(parent.id, lookupValue.parentValueId))
    .orderBy(asc(lookupList.sortOrder), asc(lookupList.label), asc(lookupValue.sortOrder));

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    label: r.label,
    description: r.description,
    listCode: r.listCode,
    listLabel: r.listLabel,
    status: r.status,
    isDefault: r.isDefault,
    needsReview: r.needsReview,
    parentId: r.parentId,
    parentLabel: r.parentLabel,
    isColour: isColourList(r.listCode),
    hex: hexOf(r.meta),
    usage: 0,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

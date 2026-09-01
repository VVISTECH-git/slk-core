import { sql } from "drizzle-orm";

import type { LookupStatus } from "@slk/domain";

import { db } from "@/lib/db";

/**
 * The vocabulary seen as a structure rather than as lists to fill in.
 *
 * Master Lists answers "what values does Colour have". This answers "what
 * classifications exist, which depend on which, and which are switched on" —
 * the shape of the taxonomy rather than its contents.
 */

export interface Classification {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isEnabled: boolean;
  /** Whether this classification only means something under another. */
  dependent: boolean;
  dependsOnId: string | null;
  dependsOn: string | null;
  status: string;
  isSystem: boolean;
  /** How many values it holds, and how many are usable. */
  total: number;
  active: number;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  isEnabled: boolean;
  classificationId: string;
  classification: string;
  /** Whether its classification depends on another. */
  dependent: boolean;
  belongsToId: string | null;
  belongsTo: string | null;
  status: LookupStatus;
  usage: number;
}

export async function loadClassifications(): Promise<Classification[]> {
  const rows = await db.execute<{
    id: string;
    code: string;
    name: string;
    description: string | null;
    is_enabled: boolean;
    depends_on_id: string | null;
    depends_on: string | null;
    status: string;
    is_system: boolean;
    total: number;
    active: number;
  }>(sql`
    select
      l.id, l.code, l.label as name, l.description,
      l.is_enabled, l.status, l.is_system,
      l.parent_list_id as depends_on_id,
      p.label          as depends_on,
      count(v.id)::int                                    as total,
      count(v.id) filter (where v.status = 'active')::int as active
    from lookup_list l
    left join lookup_list p on p.id = l.parent_list_id
    left join lookup_value v on v.list_id = l.id
    group by l.id, p.label
    order by l.sort_order, l.label
  `);

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    isEnabled: r.is_enabled,
    dependent: r.depends_on_id !== null,
    dependsOnId: r.depends_on_id,
    dependsOn: r.depends_on,
    status: r.status,
    isSystem: r.is_system,
    total: r.total,
    active: r.active,
  }));
}

/**
 * Every value, with what it belongs to.
 *
 * All of them, filtered in the browser: 227 rows is nothing to send, and a
 * filter that does not go back to the server is the difference between a list
 * that responds as you type and one that blinks.
 */
export async function loadCategories(): Promise<Category[]> {
  const rows = await db.execute<{
    id: string;
    name: string;
    description: string | null;
    status: LookupStatus;
    classification_id: string;
    classification: string;
    depends_on_id: string | null;
    belongs_to_id: string | null;
    belongs_to: string | null;
  }>(sql`
    select
      v.id, v.label as name, v.description, v.status,
      l.id    as classification_id,
      l.label as classification,
      l.parent_list_id as depends_on_id,
      v.parent_value_id as belongs_to_id,
      p.label as belongs_to
    from lookup_value v
    join lookup_list l on l.id = v.list_id
    left join lookup_value p on p.id = v.parent_value_id
    order by l.sort_order, l.label, v.sort_order, v.label
  `);

  // How many records point at each value, counted once for the whole table
  // rather than per row.
  const usage = await db.execute<{ id: string; n: number }>(sql`
    select att.attname, con.conrelid::regclass::text as tbl
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f' and con.confrelid = 'lookup_value'::regclass
      and con.conrelid <> 'lookup_value'::regclass
  `).then(async (columns) => {
    const counts = new Map<string, number>();

    for (const c of columns as unknown as { attname: string; tbl: string }[]) {
      const found = await db.execute<{ id: string; n: number }>(sql`
        select ${sql.identifier(c.attname)} as id, count(*)::int as n
        from ${sql.identifier(c.tbl)}
        where ${sql.identifier(c.attname)} is not null
        group by 1
      `);
      for (const row of found) counts.set(row.id, (counts.get(row.id) ?? 0) + row.n);
    }

    return counts;
  });

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    // A value is usable when it is Active; that is the same fact the record
    // editor reads, said in the word this screen uses.
    isEnabled: r.status === "active",
    classificationId: r.classification_id,
    classification: r.classification,
    dependent: r.depends_on_id !== null,
    belongsToId: r.belongs_to_id,
    belongsTo: r.belongs_to,
    status: r.status,
    usage: (usage as Map<string, number>).get(r.id) ?? 0,
  }));
}

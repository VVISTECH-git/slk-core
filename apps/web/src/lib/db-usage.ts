import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

/**
 * How much of the database is actually spoken for — the same question
 * `storage-usage.ts` answers for the R2 photograph bucket, asked of
 * Postgres instead. `pg_total_relation_size` already includes a table's
 * indexes and TOAST storage, so summing it across every table in `public`
 * accounts for everything that counts against the database's own size.
 */
export type TableUsage = {
  name: string;
  /** From `pg_class.reltuples` — a planner estimate, not an exact count. Fast at any table size. */
  rowEstimate: number;
  tableBytes: number;
  indexBytes: number;
  totalBytes: number;
};

export type DbUsage = {
  databaseName: string;
  totalBytes: number;
  tableCount: number;
  totalRowEstimate: number;
  tables: TableUsage[];
};

export async function loadDbUsage(): Promise<DbUsage> {
  // Postgres returns bigint columns as strings (they can exceed
  // Number.MAX_SAFE_INTEGER, which JSON/JS numbers can't always hold
  // exactly) — every size here is cast to double precision instead, the
  // same fix `invoiceAmount` and friends already use elsewhere in this
  // app. A database would need to hold ~8 petabytes before that cast
  // itself became the inexact one.
  const [info] = await db.execute<{ databaseName: string; totalBytes: number }>(sql`
    select
      current_database()                                              as "databaseName",
      pg_database_size(current_database())::double precision          as "totalBytes"
  `);

  const tables = await db.execute<TableUsage>(sql`
    select
      c.relname                                                       as "name",
      greatest(c.reltuples, 0)::double precision                       as "rowEstimate",
      pg_relation_size(c.oid)::double precision                        as "tableBytes",
      pg_indexes_size(c.oid)::double precision                         as "indexBytes",
      pg_total_relation_size(c.oid)::double precision                  as "totalBytes"
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and n.nspname = 'public'
    order by pg_total_relation_size(c.oid) desc
  `);

  return {
    databaseName: info?.databaseName ?? "",
    totalBytes: info?.totalBytes ?? 0,
    tableCount: tables.length,
    totalRowEstimate: tables.reduce((sum, t) => sum + t.rowEstimate, 0),
    tables,
  };
}

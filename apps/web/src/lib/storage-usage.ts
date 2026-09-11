import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { listObjects, storageConfigured, storageMissing } from "@/lib/storage";

/**
 * How much of the R2 bucket is actually spoken for.
 *
 * R2 has no "how big is this bucket" call — the only way to find out is to
 * list every object and add up the sizes, so this walks the whole bucket on
 * every visit. Fine at a few thousand photographs; if the catalogue grows
 * into the hundreds of thousands this will want caching, but nothing here
 * does that yet.
 */
export interface StorageUsage {
  configured: boolean;
  missing: string[];
  totalBytes: number;
  objectCount: number;
  /** Photograph rows that name a file — the database's side of the count. */
  referencedCount: number;
  /** In the bucket, but no `image` row points at it — safe to delete. */
  orphanCount: number;
  orphanBytes: number;
  /** An `image` row names a file the bucket does not have — a broken photo. */
  missingCount: number;
  byColourway: {
    colourwayId: string;
    productCode: string | null;
    name: string | null;
    bytes: number;
    count: number;
  }[];
  byExtension: { ext: string; bytes: number; count: number }[];
}

export async function loadStorageUsage(): Promise<StorageUsage> {
  if (!storageConfigured()) {
    return {
      configured: false,
      missing: storageMissing(),
      totalBytes: 0,
      objectCount: 0,
      referencedCount: 0,
      orphanCount: 0,
      orphanBytes: 0,
      missingCount: 0,
      byColourway: [],
      byExtension: [],
    };
  }

  const [objects, imageRows] = await Promise.all([
    listObjects(),
    db.execute<{ storageKey: string }>(sql`
      select storage_key as "storageKey" from image where storage_key is not null
    `),
  ]);

  const referenced = new Set(imageRows.map((r) => r.storageKey));
  const onDisk = new Set(objects.map((o) => o.key));

  let totalBytes = 0;
  let orphanBytes = 0;
  let orphanCount = 0;

  const byColourwayBytes = new Map<string, { bytes: number; count: number }>();
  const byExtBytes = new Map<string, { bytes: number; count: number }>();

  for (const obj of objects) {
    totalBytes += obj.size;

    if (!referenced.has(obj.key)) {
      orphanBytes += obj.size;
      orphanCount++;
    }

    // products/<colourwayId>/<slotId>-<stamp>.<ext> — see imageKey().
    const colourwayId = obj.key.split("/")[1] ?? "";
    const forColourway = byColourwayBytes.get(colourwayId) ?? { bytes: 0, count: 0 };
    forColourway.bytes += obj.size;
    forColourway.count += 1;
    byColourwayBytes.set(colourwayId, forColourway);

    const ext = (obj.key.split(".").pop() ?? "").toLowerCase() || "(none)";
    const forExt = byExtBytes.get(ext) ?? { bytes: 0, count: 0 };
    forExt.bytes += obj.size;
    forExt.count += 1;
    byExtBytes.set(ext, forExt);
  }

  const missingCount = imageRows.filter((r) => !onDisk.has(r.storageKey)).length;

  const topIds = [...byColourwayBytes.entries()]
    .sort((a, b) => b[1].bytes - a[1].bytes)
    .slice(0, 20)
    .map(([id]) => id)
    .filter((id) => id !== "");

  const names =
    topIds.length === 0
      ? []
      : await db.execute<{ id: string; productCode: string | null; name: string | null }>(sql`
          select cw.id, latest.code as "productCode", d.name
          from colourway cw
          join design d on d.id = cw.design_id
          left join lateral (
            select b.code from batch b
            where b.colourway_id = cw.id
            order by b.received_at desc, b.code desc limit 1
          ) latest on true
          where cw.id in (${sql.join(topIds.map((id) => sql`${id}`), sql`, `)})
        `);

  const nameById = new Map(names.map((n) => [n.id, n]));

  const byColourway = topIds.map((id) => {
    const stat = byColourwayBytes.get(id);
    const info = nameById.get(id);
    return {
      colourwayId: id,
      productCode: info?.productCode ?? null,
      name: info?.name ?? null,
      bytes: stat?.bytes ?? 0,
      count: stat?.count ?? 0,
    };
  });

  const byExtension = [...byExtBytes.entries()]
    .map(([ext, s]) => ({ ext, bytes: s.bytes, count: s.count }))
    .sort((a, b) => b.bytes - a.bytes);

  return {
    configured: true,
    missing: [],
    totalBytes,
    objectCount: objects.length,
    referencedCount: imageRows.length,
    orphanCount,
    orphanBytes,
    missingCount,
    byColourway,
    byExtension,
  };
}

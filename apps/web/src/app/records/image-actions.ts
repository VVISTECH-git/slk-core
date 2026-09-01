"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import {
  imageKey,
  presignPut,
  publicUrl,
  remove,
  storageConfigured,
  storageMissing,
} from "@/lib/storage";

import type { ActionResult } from "./actions";

/**
 * Photographs, stored in R2 and referenced from the record.
 *
 * The browser uploads straight to R2 with a signed URL; the bytes never pass
 * through this server. What passes through is the decision that a file
 * belongs to a slot, which is the only part that needs the database.
 */

/** Formats a browser will render and a phone will produce. */
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

/** 12MB. A phone photograph is 3–6MB; beyond this is a mistake, not a saree. */
const MAX_BYTES = 12 * 1024 * 1024;

export interface UploadTicket {
  ok: boolean;
  message: string;
  url?: string;
  key?: string;
}

/**
 * A signed URL for one file, into one slot.
 *
 * Every rule is checked here rather than in the browser, because this is what
 * a POST reaches. The signature it returns is bound to a single key, method
 * and content type and expires in five minutes — it is not a key to the
 * bucket.
 */
export async function presignImage(
  colourwayId: string,
  slotId: string,
  contentType: string,
  bytes: number,
): Promise<UploadTicket> {
  if (!storageConfigured()) {
    return {
      ok: false,
      message: `Image storage is not set up. Missing ${storageMissing().join(", ")}.`,
    };
  }

  const extension = ALLOWED[contentType];
  if (extension === undefined) {
    return {
      ok: false,
      message: "That is not an image the catalogue can use — JPEG, PNG, WebP or AVIF.",
    };
  }

  if (!Number.isFinite(bytes) || bytes <= 0 || bytes > MAX_BYTES) {
    return {
      ok: false,
      message: `Too large. ${Math.round(MAX_BYTES / 1024 / 1024)}MB is the limit.`,
    };
  }

  // The slot has to be a real image slot on this record. Without this, any
  // uuid would do, and the bucket would fill with objects filed under nothing.
  const [slot] = await db.execute<{ n: number }>(sql`
    select count(*)::int as n
    from lookup_value v join lookup_list l on l.id = v.list_id
    where l.code = 'image_slot' and v.id = ${slotId} and v.status = 'active'
  `);

  if ((slot?.n ?? 0) === 0) {
    return { ok: false, message: "That is not an image slot." };
  }

  const [cw] = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from colourway where id = ${colourwayId}
  `);

  if ((cw?.n ?? 0) === 0) {
    return { ok: false, message: "That record no longer exists." };
  }

  const key = imageKey(colourwayId, slotId, extension, Date.now());

  return { ok: true, message: "Ready.", url: await presignPut(key, contentType), key };
}

/**
 * Records that a photograph arrived.
 *
 * Called after the browser's upload succeeds. The old object is deleted if
 * this replaces one — R2 charges for what it holds, and an image nothing
 * points at is a bill for nothing.
 */
export async function confirmImage(
  colourwayId: string,
  slotId: string,
  key: string,
  width: number | null,
  height: number | null,
): Promise<ActionResult> {
  // A key this server did not mint has no business being written here.
  if (!key.startsWith(`products/${colourwayId}/${slotId}-`)) {
    return { ok: false, message: "That file does not belong to this slot." };
  }

  const [existing] = await db.execute<{ storageKey: string | null }>(sql`
    select storage_key as "storageKey" from image
    where colourway_id = ${colourwayId} and slot_id = ${slotId}
  `);

  await db.execute(sql`
    insert into image (colourway_id, slot_id, storage_key, width, height)
    values (${colourwayId}, ${slotId}, ${key}, ${width}, ${height})
    on conflict (colourway_id, slot_id) do update
      set storage_key = excluded.storage_key,
          width = excluded.width,
          height = excluded.height
  `);

  const previous = existing?.storageKey ?? null;
  if (previous !== null && previous !== key) {
    // Best effort. A failed delete leaves an orphan costing a fraction of a
    // penny; failing the whole upload over it would be worse.
    await remove(previous).catch(() => undefined);
  }

  revalidatePath("/records");

  return { ok: true, message: "Photograph added." };
}

/** Takes a photograph off a slot, leaving the slot itself ticked. */
export async function removeImage(
  colourwayId: string,
  slotId: string,
): Promise<ActionResult> {
  const [row] = await db.execute<{ storageKey: string | null }>(sql`
    select storage_key as "storageKey" from image
    where colourway_id = ${colourwayId} and slot_id = ${slotId}
  `);

  if (row === undefined) return { ok: false, message: "Nothing there." };

  await db.execute(sql`
    update image set storage_key = null, width = null, height = null
    where colourway_id = ${colourwayId} and slot_id = ${slotId}
  `);

  if (row.storageKey !== null) {
    await remove(row.storageKey).catch(() => undefined);
  }

  revalidatePath("/records");

  return { ok: true, message: "Photograph removed. The slot is still wanted." };
}

/** Whether uploading can work at all, for the form to say so plainly. */
export async function storageStatus(): Promise<{
  ready: boolean;
  missing: string[];
}> {
  return { ready: storageConfigured(), missing: storageMissing() };
}

/** The address a stored key is served from. */
export async function urlFor(key: string): Promise<string> {
  return publicUrl(key);
}

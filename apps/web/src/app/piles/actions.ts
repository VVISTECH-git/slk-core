"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { applyDesignPatch, createRecord } from "@/app/records/actions";
import type { AttributeKey } from "@/lib/attributes";
import { inheritedAttributeIds, loadPileDraft } from "@/lib/pile-draft";
import { assignThaansInTx, createPileInTx, type AssignOutcome, type NewPile } from "@/lib/pile-write";
import { actingId, guardJobRole } from "@/lib/session";
import { presignPut, remove, storageConfigured, storageMissing } from "@/lib/storage";

export interface ActionResult {
  ok: boolean;
  message: string;
}

/**
 * Piles are made and filled at the door, by whoever receives a delivery —
 * the same people who scan handovers. Hand-copied, not imported: a
 * `"use server"` file may only export async functions.
 */
const PILE_JOB_ROLES = ["Bale Custodian", "Handler"];

function revalidate() {
  revalidatePath("/piles");
  revalidatePath("/thaans");
}

/** Makes an empty pile — for sorting Thaans that were received "just as Thaans" earlier. */
export async function createPile(
  draft: NewPile,
  stage: string,
): Promise<ActionResult & { pile?: { id: string; code: string } }> {
  const denied = await guardJobRole(PILE_JOB_ROLES);
  if (denied !== null) return denied;
  const actorId = await actingId();

  const made = await db.transaction((tx) => createPileInTx(tx, draft, stage, actorId));
  if (!made.ok) return made;

  revalidate();
  return { ok: true, message: `Pile ${made.code} made.`, pile: { id: made.id, code: made.code } };
}

/** Puts Thaans in (or moves them to) a pile, outside a receive. */
export async function assignThaansToPile(
  pileId: string,
  thaanIds: string[],
  stage: string | null,
): Promise<ActionResult & { outcome?: AssignOutcome }> {
  const denied = await guardJobRole(PILE_JOB_ROLES);
  if (denied !== null) return denied;
  if (thaanIds.length === 0) return { ok: false, message: "Nothing to add." };

  const [p] = await db.execute<{ code: string }>(sql`select code from pile where id = ${pileId}`);
  if (p === undefined) return { ok: false, message: "That pile no longer exists." };

  const actorId = await actingId();
  const outcome = await db.transaction((tx) => assignThaansInTx(tx, pileId, thaanIds, stage, actorId));

  revalidate();
  const parts: string[] = [];
  if (outcome.added > 0) parts.push(`${outcome.added} added`);
  if (outcome.moved > 0) parts.push(`${outcome.moved} moved`);
  if (outcome.refused.length > 0) parts.push(`${outcome.refused.length} refused`);
  return {
    ok: outcome.added + outcome.moved > 0,
    message: parts.length === 0 ? `Nothing changed on ${p.code}.` : `${p.code}: ${parts.join(", ")}.`,
    outcome,
  };
}

const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_BYTES = 12 * 1024 * 1024;

/**
 * A signed URL to put a pile's photo at — same presign → PUT → confirm
 * shape as a record's photographs, and for the same reason: the bytes go
 * straight to storage, never through this server. `pileId` may be null for
 * a photo taken before the pile exists (at the door, the photo comes first);
 * the key then carries a placeholder and is bound to the pile at confirm.
 */
export async function presignPilePhoto(
  pileId: string | null,
  contentType: string,
  bytes: number,
): Promise<{ ok: true; url: string; key: string } | { ok: false; message: string }> {
  const denied = await guardJobRole(PILE_JOB_ROLES);
  if (denied !== null) return denied;

  if (!storageConfigured()) {
    return { ok: false, message: `Photo storage is not set up. Missing ${storageMissing().join(", ")}.` };
  }
  const extension = ALLOWED[contentType];
  if (extension === undefined) return { ok: false, message: "JPEG, PNG or WebP only." };
  if (!Number.isFinite(bytes) || bytes <= 0 || bytes > MAX_BYTES) {
    return { ok: false, message: `Too large. ${Math.round(MAX_BYTES / 1024 / 1024)}MB is the limit.` };
  }

  const key = `piles/${pileId ?? "new"}/photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  const url = await presignPut(key, contentType);
  return { ok: true, url, key };
}

/** The photo landed — put it on the pile (replacing an earlier one). */
export async function confirmPilePhoto(pileId: string, key: string): Promise<ActionResult> {
  const denied = await guardJobRole(PILE_JOB_ROLES);
  if (denied !== null) return denied;
  if (!key.startsWith("piles/")) return { ok: false, message: "That file does not belong to a pile." };

  const actorId = await actingId();
  const [prev] = await db.execute<{ photoKey: string | null }>(sql`select photo_key as "photoKey" from pile where id = ${pileId}`);
  if (prev === undefined) return { ok: false, message: "That pile no longer exists." };
  await db.execute(sql`update pile set photo_key = ${key}, updated_at = now() where id = ${pileId}`);

  await db.execute(sql`
    insert into pile_event (pile_id, kind, actor_id, at) values (${pileId}, 'photo_set', ${actorId}, clock_timestamp())
  `);
  if (prev.photoKey !== null && prev.photoKey !== key) await remove(prev.photoKey).catch(() => undefined);

  revalidate();
  return { ok: true, message: "Photo added." };
}

/**
 * "Complete a pile": the answers to the questions its stages so far have
 * asked. The first time, this makes the Product Management record — a
 * design and a draft colourway, seeded with everything the bale's cloth
 * item already knew — and links the pile to it. After that it patches the
 * same record. Either way the pile's main colour is the colourway's colour
 * unless told otherwise here.
 */
export async function completePile(
  pileId: string,
  patch: {
    attributes: Partial<Record<AttributeKey, string | null>>;
    colourId?: string | null;
    secondaryColourId?: string | null;
  },
): Promise<ActionResult & { colourwayId?: string; needs?: string[] }> {
  const denied = await guardJobRole(PILE_JOB_ROLES);
  if (denied !== null) return denied;

  const draft = await loadPileDraft(pileId);
  if (draft === null) return { ok: false, message: "That pile no longer exists." };

  // Only the questions this pile is actually being asked may be answered here.
  const allowed = new Set(draft.fields.map((f) => f.key));
  for (const key of Object.keys(patch.attributes)) {
    if (!allowed.has(key as AttributeKey)) return { ok: false, message: `${key} isn't decided at ${draft.stage}.` };
  }

  const actorId = await actingId();
  const colourId = patch.colourId === undefined ? draft.colourId : patch.colourId;
  const secondaryColourId = patch.secondaryColourId === undefined ? draft.secondaryColourId : patch.secondaryColourId;

  let result: ActionResult & { colourwayId?: string };
  if (draft.colourwayId === null) {
    // Everything the cloth item knew, with this pile's answers on top.
    const attributes: Partial<Record<AttributeKey, string | null>> = { ...(await inheritedAttributeIds(pileId)) };
    for (const [k, v] of Object.entries(patch.attributes)) {
      if (v === null || v === "") delete attributes[k as AttributeKey];
      else attributes[k as AttributeKey] = v;
    }

    result = await createRecord(
      {
        attributes,
        descriptors: [],
        colourId,
        secondaryColourId,
        prices: { cost: "", making: "", wholesale: "", retail: "", mrp: "" },
        quantity: "",
        openingStock: [],
        imageSlots: [],
        notes: `From pile ${draft.pileCode} (${draft.pileName}).`,
        name: "",
        nameIsCustom: false,
        extra: { lengthCm: draft.extra.lengthCm, widthCm: draft.extra.widthCm },
      },
      { fromPileId: pileId },
    );
  } else {
    result = await applyDesignPatch(draft.colourwayId, patch.attributes, { colourId, secondaryColourId });
    if (result.ok) {
      await db.execute(sql`
        insert into pile_event (pile_id, stage, kind, actor_id, detail, at)
        values (${pileId}, ${draft.stage}, 'detail_set', ${actorId}, ${JSON.stringify({ fields: Object.keys(patch.attributes) })}::jsonb, clock_timestamp())
      `);
    }
    result = { ...result, colourwayId: draft.colourwayId };
  }
  if (!result.ok) return result;

  const after = await loadPileDraft(pileId);
  const needs = after?.needs ?? [];
  // A pile with every question so far answered is "ready" — waiting only on Ironing, prices and photos.
  await db.execute(sql`
    update pile set status = ${needs.length === 0 ? "ready" : "draft"}, updated_at = now()
    where id = ${pileId} and status <> 'live'
  `);

  revalidate();
  revalidatePath("/records");
  return {
    ok: true,
    message: needs.length === 0 ? `${draft.pileCode} is complete for ${after?.stage ?? draft.stage}.` : `Saved. Still needs ${needs.join(", ")}.`,
    colourwayId: result.colourwayId ?? after?.colourwayId ?? undefined,
    needs,
  };
}

/** Rename a pile or change its main colour — the two things fixed at the door that can be wrong. */
export async function updatePile(pileId: string, draft: { name: string; mainColourId: string | null }): Promise<ActionResult> {
  const denied = await guardJobRole(PILE_JOB_ROLES);
  if (denied !== null) return denied;
  const name = draft.name.trim();
  if (name === "") return { ok: false, message: "Give the pile a name." };

  const actorId = await actingId();
  const [row] = await db.execute<{ code: string }>(sql`
    update pile set name = ${name}, main_colour_id = ${draft.mainColourId}, updated_at = now()
    where id = ${pileId} returning code
  `);
  if (row === undefined) return { ok: false, message: "That pile no longer exists." };
  await db.execute(sql`
    insert into pile_event (pile_id, kind, actor_id, detail, at)
    values (${pileId}, 'detail_set', ${actorId}, ${JSON.stringify({ name, mainColourId: draft.mainColourId })}::jsonb, clock_timestamp())
  `);
  revalidate();
  return { ok: true, message: `${row.code} updated.` };
}

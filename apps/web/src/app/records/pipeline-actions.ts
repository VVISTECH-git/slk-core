"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { applyDesignPatch } from "@/app/records/actions";
import type { AttributeKey } from "@/lib/attributes";
import { db } from "@/lib/db";
import {
  assignThaansToRecordInTx,
  loadRecordFill,
  loadRecordShelf,
  shelveInTx,
  toMinor,
  type AssignOutcome,
} from "@/lib/pipeline-records";
import { actingId, guard, guardJobRole } from "@/lib/session";

export interface ActionResult {
  ok: boolean;
  message: string;
}

function revalidate() {
  revalidatePath("/records");
  revalidatePath("/thaans");
}

/**
 * "Fill in details": the answers a record made at the door still needs.
 * Only the questions it is actually being asked may be answered here; the
 * rest of the record is edited the ordinary way.
 */
export async function saveRecordFill(
  colourwayId: string,
  patch: {
    attributes: Partial<Record<AttributeKey, string | null>>;
    colourId?: string | null;
    secondaryColourId?: string | null;
  },
): Promise<ActionResult & { needs?: string[] }> {
  const denied = await guard("floor");
  if (denied !== null) return denied;

  const fill = await loadRecordFill(colourwayId);
  if (fill === null) return { ok: false, message: "That record no longer exists." };

  const allowed = new Set(fill.fields.map((f) => f.key));
  for (const key of Object.keys(patch.attributes)) {
    if (!allowed.has(key as AttributeKey)) return { ok: false, message: `${key} isn't asked for here.` };
  }

  const result = await applyDesignPatch(colourwayId, patch.attributes, {
    colourId: patch.colourId,
    secondaryColourId: patch.secondaryColourId,
  });
  if (!result.ok) return result;

  const after = await loadRecordFill(colourwayId);
  const needs = after?.needs ?? [];
  revalidate();
  return {
    ok: true,
    message: needs.length === 0 ? `${fill.designCode} is complete.` : `Saved. Still needs ${needs.join(", ")}.`,
    needs,
  };
}

/**
 * Puts a record on the shelf: prices it (retail is required, the rest
 * optional) and turns every Thaan back from Ironing into stock in one
 * location — one consignment, one piece per Thaan carrying the Thaan's own
 * code. Repeatable: a record whose Thaans finish in parts gets another
 * consignment each time more of them come back.
 */
export async function shelveRecord(
  colourwayId: string,
  input: {
    prices: { cost: string; making: string; wholesale: string; retail: string; mrp: string };
    locationId: string;
  },
): Promise<ActionResult & { productCode?: string; pieceCodes?: string[] }> {
  const denied = await guard("floor");
  if (denied !== null) return denied;

  const shelf = await loadRecordShelf(colourwayId);
  if (shelf === null) return { ok: false, message: "That record no longer exists." };
  if (shelf.blockers.length > 0) return { ok: false, message: `Can't go on the shelf yet: ${shelf.blockers.join("; ")}.` };

  const minors: Record<string, number | null> = {};
  for (const [key, value] of Object.entries(input.prices)) {
    const m = toMinor(value);
    if (m === undefined) return { ok: false, message: `${key} is not a price.` };
    minors[key] = m;
  }
  if (minors.retail === null) return { ok: false, message: "A selling price is needed." };

  const location = shelf.locations.find((l) => l.id === input.locationId);
  if (location === undefined) return { ok: false, message: "Pick where the stock is going." };

  const actorId = await actingId();
  const note = `From production — ${shelf.designCode}`;

  const made = await db.transaction(async (tx) => {
    await tx.execute(sql`
      update colourway set
        cost_minor = ${minors.cost}, making_minor = ${minors.making}, wholesale_minor = ${minors.wholesale},
        retail_minor = ${minors.retail}, mrp_minor = ${minors.mrp},
        updated_by_id = ${actorId}, updated_at = now()
      where id = ${colourwayId}
    `);
    return shelveInTx(tx, colourwayId, shelf.finished, input.locationId, shelf.pieceTracked, note, actorId);
  });

  revalidate();
  revalidatePath("/locations");

  const n = shelf.finished.length;
  return {
    ok: true,
    message: `${n} Thaan${n === 1 ? "" : "s"} into ${location.name} as product ${made.productCode}${shelf.inPipeline > 0 ? ` — ${shelf.inPipeline} still in the pipeline` : ""}.`,
    productCode: made.productCode,
    pieceCodes: made.pieceCodes,
  };
}

/**
 * Sorts Thaans into a record outside a receive — "Put in a record" on a
 * scanned Thaan, or moving one that was sorted wrong. Door work, like the
 * receive itself, so the same job roles.
 */
export async function moveThaansToRecord(
  colourwayId: string,
  thaanIds: string[],
): Promise<ActionResult & { outcome?: AssignOutcome }> {
  const denied = await guardJobRole(["Bale Custodian", "Handler"]);
  if (denied !== null) return denied;
  if (thaanIds.length === 0) return { ok: false, message: "Nothing to add." };

  const [record] = await db.execute<{ code: string }>(sql`
    select d.code from colourway cw join design d on d.id = cw.design_id where cw.id = ${colourwayId}
  `);
  if (record === undefined) return { ok: false, message: "That record no longer exists." };

  const outcome = await db.transaction((tx) => assignThaansToRecordInTx(tx, colourwayId, thaanIds));

  revalidate();
  const parts: string[] = [];
  if (outcome.added > 0) parts.push(`${outcome.added} added`);
  if (outcome.moved > 0) parts.push(`${outcome.moved} moved`);
  if (outcome.refused.length > 0) parts.push(`${outcome.refused.length} refused`);
  return {
    ok: outcome.added + outcome.moved > 0,
    message: parts.length === 0 ? `Nothing changed on ${record.code}.` : `${record.code}: ${parts.join(", ")}.`,
    outcome,
  };
}

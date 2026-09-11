"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { colourway, recordReviewEvent } from "@slk/db";

import { allows } from "@/lib/roles";
import { db } from "@/lib/db";
import { actingId, currentActor, guard } from "@/lib/session";

import type { ActionResult } from "./actions";

/**
 * The editorial approval workflow — separate from Shopify's own draft/
 * published state (that is `channel_link.shopify_status`, Phase 10's
 * concern). This is about whether what is entered has been checked, not
 * about whether it is for sale anywhere yet.
 *
 *     draft/needs_changes --submit--> submitted --approve--> approved
 *                ^                        |
 *                └──── request changes ───┘
 *
 *     approved --unapprove--> draft
 *
 * Every transition writes one `record_review_event` row — append-only,
 * the same convention `movement` established for stock — and updates the
 * denormalised columns on `colourway` in the same transaction, so a badge
 * on the records table never has to join the event log to render.
 */

type ReviewStatus = "draft" | "submitted" | "needs_changes" | "approved";

/** What a status is allowed to become next, and who may make it happen. */
const EDGES: Record<ReviewStatus, { to: ReviewStatus; action: string }[]> = {
  draft: [{ to: "submitted", action: "submit" }],
  needs_changes: [{ to: "submitted", action: "submit" }],
  submitted: [
    { to: "approved", action: "approve" },
    { to: "needs_changes", action: "request changes on" },
  ],
  approved: [{ to: "draft", action: "unapprove" }],
};

async function loadColourway(colourwayId: string) {
  const rows = await db
    .select({ reviewStatus: colourway.reviewStatus, createdBy: colourway.createdBy })
    .from(colourway)
    .where(eq(colourway.id, colourwayId));

  return rows[0] ?? null;
}

/**
 * The one place every transition passes through — checks the edge is legal,
 * writes the event, updates `colourway`, revalidates the list. Individual
 * actions below only decide who may call it and what extra columns to stamp.
 */
async function transition(
  colourwayId: string,
  toStatus: ReviewStatus,
  extra: Record<string, unknown>,
  comment: string | null,
): Promise<ActionResult> {
  const row = await loadColourway(colourwayId);
  if (row === null) return { ok: false, message: "That record no longer exists." };

  const from = row.reviewStatus as ReviewStatus;
  const legal = EDGES[from]?.some((e) => e.to === toStatus) ?? false;
  if (!legal) {
    return { ok: false, message: `That record is ${from.replace("_", " ")} — this action does not apply.` };
  }

  const actorId = await actingId();

  await db.transaction(async (tx) => {
    await tx
      .update(colourway)
      .set({ reviewStatus: toStatus, updatedAt: new Date(), ...extra })
      .where(eq(colourway.id, colourwayId));

    await tx.insert(recordReviewEvent).values({
      colourwayId,
      actorId,
      fromStatus: from,
      toStatus,
      comment,
    });
  });

  revalidatePath("/records");

  return { ok: true, message: `Moved to ${toStatus.replace("_", " ")}.` };
}

/**
 * Draft/Needs Changes → Submitted. Floor may submit their own record;
 * office may submit anyone's — the same "own record" boundary the plan's
 * state diagram draws. `createdBy` is null on every record that predates
 * this column (Phase 1's backfill left it unset on the already-approved
 * rows), so a floor actor is refused rather than let through on a record
 * nobody can confirm is theirs.
 */
export async function submitForReview(colourwayId: string): Promise<ActionResult> {
  const denied = await guard("floor");
  if (denied !== null) return denied;

  const who = await currentActor();
  if (who === null) return { ok: false, message: "Sign in to do that." };

  if (!allows(who.role, "office")) {
    const row = await loadColourway(colourwayId);
    if (row === null) return { ok: false, message: "That record no longer exists." };
    if (row.createdBy !== who.id) {
      return { ok: false, message: "This record belongs to someone else." };
    }
  }

  return transition(colourwayId, "submitted", { submittedBy: who.id, submittedAt: new Date() }, null);
}

/**
 * Submitted → Needs Changes. Office only, and a rejection with no reason is
 * refused — the comment is what the floor actor sees when they reopen the
 * record, and "needs changes" with nothing to say why is not a review.
 */
export async function requestChanges(colourwayId: string, comment: string): Promise<ActionResult> {
  const denied = await guard("office");
  if (denied !== null) return denied;

  const trimmed = comment.trim();
  if (trimmed === "") {
    return { ok: false, message: "Say what needs to change." };
  }

  const who = await currentActor();
  return transition(
    colourwayId,
    "needs_changes",
    { reviewedBy: who?.id ?? null, reviewedAt: new Date() },
    trimmed,
  );
}

/** Submitted → Approved. Office only. */
export async function approve(colourwayId: string): Promise<ActionResult> {
  const denied = await guard("office");
  if (denied !== null) return denied;

  const who = await currentActor();
  return transition(colourwayId, "approved", { reviewedBy: who?.id ?? null, reviewedAt: new Date() }, null);
}

/**
 * Approved → Draft. Office only — sends a record that turned out to need
 * another look back to the start of the workflow rather than leaving it
 * Approved while someone edits it underneath that status.
 */
export async function unapprove(colourwayId: string): Promise<ActionResult> {
  const denied = await guard("office");
  if (denied !== null) return denied;

  return transition(colourwayId, "draft", {}, null);
}

import { recordMovement } from "@/app/records/actions";
import { ApiError, body, guarded, recordIdFrom } from "@/lib/api";
import { claim, complete, keyFrom, release } from "@/lib/idempotency";
import type { MovementDraft, MovementKind } from "@/lib/movements";

/**
 * One line in the ledger: received, returned, sold, damaged or transferred.
 *
 * Wraps recordMovement exactly as /records wraps createRecord — same
 * validation, same append-only write. `floor`: whoever is standing at the
 * shelf moving stock is who records it.
 *
 * Idempotency-keyed like a create, for the same reason: a dropped connection
 * after a "Received 12" is indistinguishable, to the phone, from one that
 * never went through, and the person holding the delivery will press it
 * again. Unlike a create there is no id to hand back on retry — the answer is
 * just "already recorded" and nothing sent twice.
 */
export const POST = guarded("floor", async (request, actor) => {
  const id = recordIdFrom(request.url);

  const key = keyFrom(request);
  const already = await claim(key, actor.id);
  if (already !== null) {
    return { ok: true, message: "Already recorded — nothing sent twice." };
  }

  const raw = await body(request);

  const draft: MovementDraft = {
    kind: String(raw.kind ?? "") as MovementKind,
    locationId: String(raw.locationId ?? ""),
    toLocationId: raw.toLocationId === undefined || raw.toLocationId === null
      ? undefined
      : String(raw.toLocationId),
    qty: String(raw.qty ?? ""),
    reference: String(raw.reference ?? ""),
    note: String(raw.note ?? ""),
  };

  let result: Awaited<ReturnType<typeof recordMovement>>;

  try {
    result = await recordMovement(id, draft);
  } catch (error) {
    // Nothing was written, so the key must not stay held — a corrected
    // resubmit is the same intent, not a duplicate.
    await release(key);
    throw error;
  }

  if (!result.ok) {
    await release(key);
    throw new ApiError(result.message, 422, result.errors);
  }

  await complete(key, id);

  return { message: result.message };
});

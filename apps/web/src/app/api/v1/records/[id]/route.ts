import { saveRecord } from "@/app/records/actions";
import { ApiError, body, guarded, recordIdFrom } from "@/lib/api";
import { loadRecord } from "@/lib/editor";
import { applyToDraft, draftFromRecord } from "@/lib/record-draft";

/**
 * One record, whole — and the way it is changed.
 *
 * The id is read off the URL rather than taken from the body on the write. A
 * PATCH to /records/A carrying a body that says B is a request that means two
 * things, and the safe reading of it is neither.
 */

export const GET = guarded("floor", async (request) => {
  const record = await loadRecord(recordIdFrom(request.url));

  if (record === null) throw new ApiError("No such record.", 404);

  return record;
});

/**
 * Change a record, touching only what the request names.
 *
 * `floor`, matching creation. It was `office`, which left whoever entered a
 * record unable to correct their own typo — they could mint a design code and
 * a consignment but not fix a price they had just mistyped, which is a strange
 * place to draw a line.
 *
 * **This is a genuine partial update, and it has to be.** `saveRecord` writes
 * every attribute column it knows about, reading an absent one as null, so
 * handing it a draft built only from the request body would blank the thirty
 * fields the body did not mention. The record is therefore loaded first and
 * the body overlaid on it.
 *
 * No idempotency key, unlike creating. Applying the same body twice reaches
 * the same state: the columns are set to the values given, and the one part
 * that appends rather than overwrites — a stock correction — converges,
 * because the second attempt finds the count already at the target and records
 * nothing.
 */
export const PATCH = guarded("floor", async (request) => {
  const id = recordIdFrom(request.url);

  const current = await loadRecord(id);
  if (current === null) throw new ApiError("No such record.", 404);

  const result = await saveRecord(
    applyToDraft(draftFromRecord(current), await body(request)),
  );

  if (!result.ok) throw new ApiError(result.message, 422, result.errors);

  /*
    How far this reached.

    Attributes belong to the design, and a design can carry several colours —
    so an edit to the fibre of one record silently changes it for every colour
    of that saree. The web editor says so on screen; the API says so in its
    answer, because a client that cannot tell will not warn anyone.
  */
  if (current.siblings.length > 1) {
    return { id, alsoChanged: current.siblings.length - 1 };
  }

  return { id };
});

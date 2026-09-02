import { createRecord } from "@/app/records/actions";
import { ApiError, body, guarded } from "@/lib/api";
import { claim, complete, keyFrom, release } from "@/lib/idempotency";
import { toRecordDraft } from "@/lib/record-draft";
import { loadRecords } from "@/lib/records";

/**
 * The catalogue, and the way a new record enters it.
 *
 * Both wrap what the ops web app already calls. The Server Actions behind
 * /records are plain async functions that happen to be marked "use server";
 * calling them from here runs the same validation, mints codes the same way
 * and writes the same opening movements. A second write path would be a
 * second set of rules about what a record must have, and the two would not
 * stay the same for long.
 */

/**
 * Every record, unpaged.
 *
 * Honest about its limit: this returns the whole catalogue, which is fine at
 * SLK's ~150 designs and not fine at ten times that. When it stops being fine
 * the filter belongs in `loadRecords` as SQL, not in a slice here — the cost
 * is the query, not the JSON.
 */
export const GET = guarded("floor", () => loadRecords());

/**
 * Create a record.
 *
 * `floor`. Whoever is holding the delivery is who enters it — the alternative
 * is a person in the warehouse reading attributes down the phone to somebody
 * at a desk, which is slower and gets them wrong.
 *
 * It was `office` briefly, on the reasoning that pricing a line and minting a
 * code printed on a label is an office act. That reasoning was about the
 * *consequence* and ignored who is actually standing there; SLK's floor staff
 * are the ones receiving goods.
 */
export const POST = guarded("floor", async (request, actor) => {
  /*
    The key is taken before the draft is even parsed.

    Claiming first is what makes a retry safe: a network that drops between
    this request committing and its answer arriving looks, to the phone,
    exactly like a request that never left — and the person holding it will
    press Create again. Without this that second press is a second design, a
    second consignment and six more item codes.
  */
  const key = keyFrom(request);
  const already = await claim(key, actor.id);

  // The first attempt did go through; its answer was lost, not its work.
  if (already !== null) return { id: already };

  let result: Awaited<ReturnType<typeof createRecord>>;

  try {
    result = await createRecord(toRecordDraft(await body(request)));
  } catch (error) {
    // Nothing was created, so the key must not stay held — otherwise a
    // corrected resubmit is refused as a duplicate of a record that does not
    // exist.
    await release(key);
    throw error;
  }

  if (!result.ok) {
    await release(key);
    /*
      422 rather than 400: the body was understood and refused on its merits.

      `errors` rides along with the message so a client can point at the field
      that is wrong. slk-mobile's ApiClient shows `error` and ignores the rest
      today, which is the right failure mode — a message a person can read,
      and richer detail waiting for whoever wants to use it.
    */
    throw new ApiError(result.message, 422, result.errors);
  }

  /*
    A create that cannot say what it created is a failure from here, whatever
    the action thought. The phone has nothing to open, nothing to attach a
    photograph to, and no way to find the row again except by guessing which
    of them is new.
  */
  if (result.colourwayId === undefined) {
    // Not released: something may well have been written, and handing the key
    // back would invite a retry that duplicates it.
    throw new ApiError("The record was created but could not be read back.", 500);
  }

  // Recorded last, so a repeat of this key from here on is answered with the
  // same id rather than making a second record.
  await complete(key, result.colourwayId);

  return { id: result.colourwayId };
});

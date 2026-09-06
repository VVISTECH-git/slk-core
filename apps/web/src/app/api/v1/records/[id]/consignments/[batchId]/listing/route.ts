import { setBatchListing, type BatchListingPatch } from "@/app/records/actions";
import { ApiError, body, guarded, idAfter } from "@/lib/api";

/**
 * Override what a consignment says on a listing — title, description,
 * weight, HSN code — without touching the rest of the record. Blank clears
 * an override rather than storing an empty sentence; see setBatchListing's
 * own doc comment for exactly how each field composes when left unset.
 *
 * `office`, matching Publish itself: this only schedules a future listing
 * push, but a listing's wording is the same kind of call as putting it in
 * front of a customer at all.
 */
export const PATCH = guarded("office", async (request) => {
  const batchId = idAfter(request.url, "consignments");
  const raw = await body(request);

  const patch: BatchListingPatch = {};
  if ("title" in raw) patch.title = raw.title === null ? null : String(raw.title);
  if ("description" in raw) {
    patch.description = raw.description === null ? null : String(raw.description);
  }
  if ("weightGrams" in raw) {
    patch.weightGrams = raw.weightGrams === null ? null : Number(raw.weightGrams);
  }
  if ("hsnCode" in raw) patch.hsnCode = raw.hsnCode === null ? null : String(raw.hsnCode);

  const result = await setBatchListing(batchId, patch);
  if (!result.ok) throw new ApiError(result.message, 422, result.errors);

  return { message: result.message };
});

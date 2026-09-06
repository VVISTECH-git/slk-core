import { archiveRecord } from "@/app/records/actions";
import { ApiError, guarded, recordIdFrom } from "@/lib/api";

/**
 * Take a record out of the active catalogue without touching its history.
 *
 * `office`, matching the web dialog this mirrors: putting a record where the
 * floor no longer sees it is a bigger call than correcting a typo, but not so
 * big it needs `deleteRecord`'s `owner`. See archiveRecord's own doc comment
 * for exactly what this does and does not touch — no movement, piece, batch
 * or image is deleted; only `colourway.isActive` (and, if this was the
 * design's last active colour, `design.status`) changes.
 */
export const POST = guarded("office", async (request) => {
  const id = recordIdFrom(request.url);

  const result = await archiveRecord(id);
  if (!result.ok) throw new ApiError(result.message, 422, result.errors);

  return { message: result.message };
});

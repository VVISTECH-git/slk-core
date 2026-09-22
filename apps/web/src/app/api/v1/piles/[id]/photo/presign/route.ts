import { presignPilePhoto } from "@/app/piles/actions";
import { ApiError, body, guardedJobRole, idAfter } from "@/lib/api";

/**
 * A signed URL to put a pile's photo at. The id may be the literal `new`
 * for a photo taken before the pile exists — at the door the photo comes
 * first — and the key comes back through `POST /handovers/receive` or
 * `POST /piles` as `photoKey`.
 */
export const POST = guardedJobRole(["Bale Custodian", "Handler"], async (request) => {
  const id = idAfter(request.url, "piles");
  const raw = await body(request);
  const contentType = typeof raw.contentType === "string" ? raw.contentType : "";
  const bytes = typeof raw.bytes === "number" ? raw.bytes : NaN;

  const ticket = await presignPilePhoto(id === "new" ? null : id, contentType, bytes);
  if (!ticket.ok) throw new ApiError(ticket.message, 409);

  return { url: ticket.url, key: ticket.key };
});

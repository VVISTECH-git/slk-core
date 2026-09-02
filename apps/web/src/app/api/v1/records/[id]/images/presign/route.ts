import { presignImage } from "@/app/records/image-actions";
import { ApiError, body, guarded, recordIdFrom } from "@/lib/api";

/**
 * A signed URL to put one photograph at.
 *
 * The bytes never come through this server. The phone asks for a ticket, PUTs
 * the file straight to R2 on it, then tells us it arrived — which is the only
 * part the database has any business knowing about.
 *
 * Sending the photograph through here instead would mean raising Next's body
 * limit and paying for every megabyte twice, inbound and outbound, for no
 * benefit: the server has nothing to say about the pixels.
 *
 * `floor`. Photographing what is in the building is floor work — arguably the
 * most floor-shaped thing in the whole app.
 */
export const POST = guarded("floor", async (request) => {
  const id = recordIdFrom(request.url);
  const fields = await body(request);

  const slotId = typeof fields["slotId"] === "string" ? fields["slotId"].trim() : "";
  const contentType =
    typeof fields["contentType"] === "string" ? fields["contentType"].trim() : "";
  const bytes = typeof fields["bytes"] === "number" ? fields["bytes"] : NaN;

  if (slotId === "" || contentType === "") {
    throw new ApiError("A slot and a content type are needed.", 400);
  }

  const ticket = await presignImage(id, slotId, contentType, bytes);

  if (!ticket.ok) {
    /*
      409 rather than 400 or 500.

      Every refusal here is about the state of things rather than the shape of
      the request — storage not configured, a slot that is not a slot, a record
      that has gone, a file too large. The message says which, and it is
      written to be read by whoever is holding the phone.
    */
    throw new ApiError(ticket.message, 409);
  }

  // `url` is the signed PUT target and expires in five minutes; `key` is what
  // the confirm call must send back, and is bound to this record and slot.
  return { url: ticket.url, key: ticket.key };
});

import { ApiError, guardedSignedIn } from "@/lib/api";
import { findPieces } from "@/lib/pieces";

/**
 * What did I just scan?
 *
 * The floor's question, asked with a saree in one hand and a phone in the
 * other: which one is this, is it still ours, and where does the ledger think
 * it is. Answered by the code printed on the label — either the item code on
 * the saree, or the product code shared by everything in its consignment.
 *
 * A product code returns the whole delivery, which is what makes counting one
 * possible: scan the box, see the ten sarees that came in it.
 *
 * Signed-in-only — a read, not an edit, and "which one is this" is exactly
 * the question a job-role-specific screen (Handovers, say) would still need
 * to ask about a scan that turns out to belong to something else.
 */
export const GET = guardedSignedIn(async (request) => {
  const code = decodeURIComponent(
    new URL(request.url).pathname.split("/").pop() ?? "",
  ).trim();

  /*
    Digits only, and short — item and product codes, minted from sequences
    (500001 and up, 300001 and up) — or a Thaan code (T00002001): a record
    shelved through Kora to Shelf keeps the label stitched on at cutting as
    the piece's own code, so that label is still a valid scan at the till.
    Anything else is a QR from somewhere other than a label on our stock.
    Said plainly rather than passed to Postgres to come back empty, because
    "that is not one of our codes" and "we have no such piece" are different
    answers and a person scanning wants to know which.
  */
  if (!/^\d{1,12}$/.test(code) && !/^T\d{8}$/.test(code)) {
    throw new ApiError("That is not an SLK label.", 400);
  }

  const pieces = await findPieces(code);

  if (pieces.length === 0) {
    throw new ApiError("No piece carries that code.", 404);
  }

  return pieces;
});

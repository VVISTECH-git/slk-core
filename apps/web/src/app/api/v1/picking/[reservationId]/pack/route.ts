import { packReservation } from "@/app/picking/actions";
import { ApiError, body, guarded } from "@/lib/api";

/**
 * Pack one reservation — the one step the Shopify bridge never takes on its
 * own: nothing physical happens when an order arrives, so nothing moves in
 * the ledger until somebody here says it actually left. See
 * packReservation's own doc comment for why the claim, the stock check and
 * the write are three sequential statements rather than one transaction.
 *
 * The reservation id comes off the URL, matching how a record's id does —
 * a body that named a different one would mean two things.
 */
export const POST = guarded("floor", async (request) => {
  const reservationId = decodeURIComponent(
    new URL(request.url).pathname.split("/").at(-2) ?? "",
  );

  if (!/^[0-9a-f-]{36}$/i.test(reservationId)) {
    throw new ApiError("Not a reservation id.", 400);
  }

  const { locationId } = await body(request);

  const result = await packReservation(reservationId, String(locationId ?? ""));
  if (!result.ok) throw new ApiError(result.message, 422, result.errors);

  return { message: result.message };
});

import { confirmPilePhoto } from "@/app/piles/actions";
import { ApiError, body, guardedJobRole, idAfter } from "@/lib/api";

/** The photo landed — put it on the pile. */
export const POST = guardedJobRole(["Bale Custodian", "Handler"], async (request) => {
  const id = idAfter(request.url, "piles");
  const raw = await body(request);
  const key = typeof raw.key === "string" ? raw.key.trim() : "";
  if (key === "") throw new ApiError("Pass key.", 400);

  const result = await confirmPilePhoto(id, key);
  if (!result.ok) throw new ApiError(result.message, 409);

  return { message: result.message };
});

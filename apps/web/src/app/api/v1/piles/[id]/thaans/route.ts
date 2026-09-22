import { assignThaansToPile } from "@/app/piles/actions";
import { ApiError, body, guardedJobRole, idAfter } from "@/lib/api";

/**
 * Puts Thaans in this pile — or moves them here from another. "Move a
 * Thaan" on the phone, and sorting a "just Thaans" delivery after the fact.
 */
export const POST = guardedJobRole(["Bale Custodian", "Handler"], async (request) => {
  const id = idAfter(request.url, "piles");
  const raw = await body(request);
  const thaanIds = Array.isArray(raw.thaanIds) ? raw.thaanIds.map(String) : [];
  const stage = typeof raw.stage === "string" && raw.stage !== "" ? raw.stage : null;

  const result = await assignThaansToPile(id, thaanIds, stage);
  if (!result.ok) throw new ApiError(result.message, 422);

  return { message: result.message, outcome: result.outcome };
});

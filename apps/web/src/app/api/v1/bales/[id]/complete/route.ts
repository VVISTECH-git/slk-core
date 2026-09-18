import { markCuttingComplete } from "@/app/bales/actions";
import { ApiError, guardedJobRole, idAfter } from "@/lib/api";

/**
 * Closes a bale's cutting out — wraps the same Server Action the web Bale
 * Intake table calls. No idempotency key: the underlying update only ever
 * matches a bale still `cutting_in_progress`, so a retried request after a
 * genuine success simply finds nothing to complete and answers with that,
 * rather than doing anything twice.
 *
 * Gated by job role, not Role — see bales/page.tsx's own BALE_JOB_ROLES.
 */
export const POST = guardedJobRole(["Bale Custodian"], async (request) => {
  const id = idAfter(request.url, "bales");

  const result = await markCuttingComplete(id);
  if (!result.ok) throw new ApiError(result.message, 422);

  return { message: result.message };
});

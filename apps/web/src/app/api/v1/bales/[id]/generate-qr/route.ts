import { generateQrCodes } from "@/app/bales/actions";
import { ApiError, guardedJobRole, idAfter } from "@/lib/api";

/**
 * Assigns permanent codes to a bale's still-uncoded Thaans — wraps the same
 * Server Action the web Bale Intake table calls. Irreversible per Thaan once
 * a code is set, so the underlying update only ever matches rows still
 * `code is null`: a retried request after a genuine success simply finds
 * nothing left to code.
 *
 * Gated by job role, not Role — see bales/page.tsx's own BALE_JOB_ROLES.
 */
export const POST = guardedJobRole(["Bale Custodian"], async (request) => {
  const id = idAfter(request.url, "bales");

  const result = await generateQrCodes(id);
  if (!result.ok) throw new ApiError(result.message, 422);

  return { message: result.message };
});

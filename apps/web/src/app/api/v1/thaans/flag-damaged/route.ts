import { flagThaanDamaged } from "@/app/thaans/actions";
import { ApiError, body, guardedJobRole } from "@/lib/api";
import { loadThaanByCode } from "@/lib/thaans";

/**
 * Flags a Thaan damaged from mobile's "Scan a Thaan" screen — takes the
 * scanned code, not an id, since that's all the lookup screen has on hand.
 * Wraps the same action a web equivalent would call.
 *
 * Gated by job role, not Role — see handovers/page.tsx's own HANDOVER_JOB_ROLES.
 */
export const POST = guardedJobRole(["Bale Custodian", "Handler"], async (request) => {
  const raw = await body(request);
  const code = typeof raw.code === "string" ? raw.code.trim() : "";
  const vendorId = typeof raw.vendorId === "string" ? raw.vendorId : null;
  const notes = typeof raw.notes === "string" ? raw.notes : "";

  if (code === "") throw new ApiError("Pass code.", 400);

  const thaan = await loadThaanByCode(code);
  if (thaan === null) throw new ApiError(`No Thaan with code "${code}".`, 404);

  const result = await flagThaanDamaged(thaan.id, vendorId, notes);
  if (!result.ok) throw new ApiError(result.message, 422);

  return { message: result.message };
});

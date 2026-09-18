import { sendBatch } from "@/app/handovers/actions";
import { ApiError, body, guardedJobRole } from "@/lib/api";

/**
 * Sends a scanned batch off for one stage, to one vendor (or in-house) —
 * wraps the same action the web Send screen's confirm button calls. No
 * idempotency key: re-checked per Thaan inside the insert itself (see
 * `sendBatch`), so a retried request just finds fewer left to send rather
 * than sending anything twice.
 *
 * Gated by job role, not Role — see handovers/page.tsx's own HANDOVER_JOB_ROLES.
 */
export const POST = guardedJobRole(["Bale Custodian", "Handler"], async (request) => {
  const raw = await body(request);
  const stage = typeof raw.stage === "string" ? raw.stage : "";
  const vendorId = typeof raw.vendorId === "string" ? raw.vendorId : null;
  const thaanIds = Array.isArray(raw.thaanIds) ? raw.thaanIds.map(String) : [];

  const result = await sendBatch(stage, vendorId, thaanIds);
  if (!result.ok) throw new ApiError(result.message, 422);

  return { message: result.message };
});

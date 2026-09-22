import { moveThaansToRecord } from "@/app/records/pipeline-actions";
import { ApiError, body, guarded, guardedJobRole, recordIdFrom } from "@/lib/api";
import { loadPipelineThaans } from "@/lib/pipeline-records";

/** The Thaans sorted into this record: where each is in the pipeline, and the piece it became once shelved. */
export const GET = guarded("floor", async (request) => loadPipelineThaans(recordIdFrom(request.url)));

/**
 * Sorts Thaans into this record — "Put in a record" on a scanned Thaan,
 * or moving one that was sorted wrong. Door work, so the receive's roles.
 */
export const POST = guardedJobRole(["Bale Custodian", "Handler"], async (request) => {
  const raw = await body(request);
  const thaanIds = Array.isArray(raw.thaanIds) ? raw.thaanIds.map(String) : [];

  const result = await moveThaansToRecord(recordIdFrom(request.url), thaanIds);
  if (!result.ok) throw new ApiError(result.message, 422);

  return { message: result.message, outcome: result.outcome };
});

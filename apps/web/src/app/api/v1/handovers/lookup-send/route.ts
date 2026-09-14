import { lookupForSend } from "@/app/handovers/actions";
import { ApiError, body, guarded } from "@/lib/api";

/**
 * Whether a scanned code can be sent for a stage right now — wraps the same
 * check the web Send screen runs per scan. `stage: null` (or omitted) means
 * "not chosen yet": the first scan of a batch reads its own next stage back
 * instead of being refused, the same auto-detect the web screen does.
 */
export const POST = guarded("floor", async (request) => {
  const raw = await body(request);
  const code = typeof raw.code === "string" ? raw.code : "";
  const stage = typeof raw.stage === "string" ? raw.stage : null;

  const result = await lookupForSend(code, stage);
  if (!result.ok) throw new ApiError(result.message, 422);

  return { thaan: result.thaan, stage: result.stage };
});

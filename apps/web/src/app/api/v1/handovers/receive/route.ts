import { receiveBatch } from "@/app/handovers/actions";
import { ApiError, body, guarded } from "@/lib/api";

/**
 * Marks a scanned batch received, and bills whatever came back from a
 * vendor — wraps the same action the web Receive screen's confirm button
 * calls, including the same automatic billing at the vendor's rate.
 */
export const POST = guarded("floor", async (request) => {
  const raw = await body(request);
  const thaanIds = Array.isArray(raw.thaanIds) ? raw.thaanIds.map(String) : [];

  const result = await receiveBatch(thaanIds);
  if (!result.ok) throw new ApiError(result.message, 422);

  return { message: result.message };
});

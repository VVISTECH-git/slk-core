import { lookupForReceive } from "@/app/handovers/actions";
import { ApiError, body, guarded } from "@/lib/api";

/** Whether a scanned code is out for some stage right now, and what it's returning from. */
export const POST = guarded("floor", async (request) => {
  const raw = await body(request);
  const code = typeof raw.code === "string" ? raw.code : "";

  const result = await lookupForReceive(code);
  if (!result.ok) throw new ApiError(result.message, 422);

  return { thaan: result.thaan };
});

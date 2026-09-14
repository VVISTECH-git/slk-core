import { createBale } from "@/app/bales/actions";
import { ApiError, body, guarded } from "@/lib/api";
import { loadBales } from "@/lib/bales";
import { toBaleDraft } from "@/lib/bale-draft";

/**
 * Kora to Shelf, step one — receiving a bale.
 *
 * Wraps the same Server Action the web Bale Intake page calls (see
 * api/v1/records/route.ts for why calling a "use server" action from a route
 * handler is fine): one validation path for a bale, whichever client is
 * holding it.
 */

/** Every bale on file, newest first — same shape the web table renders. */
export const GET = guarded("floor", () => loadBales());

export const POST = guarded("floor", async (request) => {
  const result = await createBale(toBaleDraft(await body(request)));

  if (!result.ok) throw new ApiError(result.message, 422);

  return { message: result.message };
});

import { recordThaans } from "@/app/bales/actions";
import { ApiError, body, guarded, idAfter } from "@/lib/api";
import { claim, complete, keyFrom, release } from "@/lib/idempotency";

/**
 * Recording Thaans cut from a bale — wraps the same Server Action the web
 * Bale Intake table calls. Idempotency-keyed like a movement: an insert
 * that runs twice on a retried request would mint real, physical Thaans
 * that were never actually cut, which a phone on a flaky warehouse
 * connection is exactly positioned to cause.
 */
export const POST = guarded("floor", async (request, actor) => {
  const id = idAfter(request.url, "bales");

  const key = keyFrom(request);
  const already = await claim(key, actor.id);
  if (already !== null) {
    return { ok: true, message: "Already recorded — nothing sent twice." };
  }

  const raw = await body(request);
  const thaanCount = typeof raw.thaanCount === "number" ? String(raw.thaanCount) : String(raw.thaanCount ?? "");

  let result: Awaited<ReturnType<typeof recordThaans>>;

  try {
    result = await recordThaans(id, thaanCount);
  } catch (error) {
    await release(key);
    throw error;
  }

  if (!result.ok) {
    await release(key);
    throw new ApiError(result.message, 422);
  }

  await complete(key, id);

  return { message: result.message };
});

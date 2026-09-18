import { recordThaans } from "@/app/bales/actions";
import { ApiError, body, guardedJobRole, idAfter } from "@/lib/api";
import { claim, complete, keyFrom, release } from "@/lib/idempotency";
import { loadThaanPrintBatch } from "@/lib/thaans";

/**
 * The Thaans from one bale that already have a code — what the mobile Record
 * Cutting screen's own "Print QR codes" hands to its PDF label builder.
 * Reuses the same lookup the web print page's `loadThaanPrintBatch` does;
 * mobile renders its own QR from `code` (`pw.BarcodeWidget`), so the SVG
 * data URI that batch also carries is simply left unused here rather than
 * duplicating the query without it.
 *
 * Gated by job role, not Role — see bales/page.tsx's own BALE_JOB_ROLES.
 */
export const GET = guardedJobRole(["Bale Custodian"], async (request) => {
  const id = idAfter(request.url, "bales");
  const batch = await loadThaanPrintBatch(id);
  return { baleCode: batch.baleCode, codes: batch.rows.map((r) => r.code) };
});

/**
 * Recording Thaans cut from a bale — wraps the same Server Action the web
 * Bale Intake table calls. Idempotency-keyed like a movement: an insert
 * that runs twice on a retried request would mint real, physical Thaans
 * that were never actually cut, which a phone on a flaky warehouse
 * connection is exactly positioned to cause.
 *
 * Gated by job role, not Role — see bales/page.tsx's own BALE_JOB_ROLES.
 */
export const POST = guardedJobRole(["Bale Custodian"], async (request, actor) => {
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

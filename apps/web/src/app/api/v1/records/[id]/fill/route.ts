import { saveRecordFill } from "@/app/records/pipeline-actions";
import { ApiError, body, guarded, recordIdFrom } from "@/lib/api";
import type { AttributeKey } from "@/lib/attributes";
import { loadRecordFill } from "@/lib/pipeline-records";

/**
 * "Fill in details" for a record made at the door: the facts already known
 * (read-only), the questions still open (editable, with the Master List
 * each is picked from), and what's still missing.
 */
export const GET = guarded("floor", async (request) => {
  const fill = await loadRecordFill(recordIdFrom(request.url));
  if (fill === null) throw new ApiError("No such record.", 404);
  return fill;
});

/**
 * The answers. `attributes` maps attribute keys (as the GET names them) to
 * lookup value ids, or null to clear; `colourId` / `secondaryColourId`
 * change the colours, left out to keep them.
 */
export const POST = guarded("floor", async (request) => {
  const raw = await body(request);

  const attributes: Partial<Record<AttributeKey, string | null>> = {};
  if (typeof raw.attributes === "object" && raw.attributes !== null) {
    for (const [k, v] of Object.entries(raw.attributes as Record<string, unknown>)) {
      if (v === null || typeof v === "string") attributes[k as AttributeKey] = v === "" ? null : v;
    }
  }
  const colour = (v: unknown): string | null | undefined =>
    v === undefined ? undefined : v === null || v === "" ? null : typeof v === "string" ? v : undefined;

  const result = await saveRecordFill(recordIdFrom(request.url), {
    attributes,
    colourId: colour(raw.colourId),
    secondaryColourId: colour(raw.secondaryColourId),
  });
  if (!result.ok) throw new ApiError(result.message, 422);

  return { message: result.message, needs: result.needs ?? [] };
});

import { completePile } from "@/app/piles/actions";
import { ApiError, body, guardedJobRole, idAfter } from "@/lib/api";
import type { AttributeKey } from "@/lib/attributes";

/**
 * The answers to a pile's questions. `attributes` maps attribute keys (as
 * `GET /piles/:id/draft` names them) to lookup value ids, or null to clear;
 * `colourId` / `secondaryColourId` are the colourway's colours, left out to
 * keep what the pile already has. The first save makes the Product
 * Management record; later ones patch it.
 */
export const POST = guardedJobRole(["Bale Custodian", "Handler"], async (request) => {
  const id = idAfter(request.url, "piles");
  const raw = await body(request);

  const attributes: Partial<Record<AttributeKey, string | null>> = {};
  if (typeof raw.attributes === "object" && raw.attributes !== null) {
    for (const [k, v] of Object.entries(raw.attributes as Record<string, unknown>)) {
      if (v === null || typeof v === "string") attributes[k as AttributeKey] = v === "" ? null : v;
    }
  }
  const colour = (v: unknown): string | null | undefined =>
    v === undefined ? undefined : v === null || v === "" ? null : typeof v === "string" ? v : undefined;

  const result = await completePile(id, {
    attributes,
    colourId: colour(raw.colourId),
    secondaryColourId: colour(raw.secondaryColourId),
  });
  if (!result.ok) throw new ApiError(result.message, 422);

  return { message: result.message, colourwayId: result.colourwayId ?? null, needs: result.needs ?? [] };
});

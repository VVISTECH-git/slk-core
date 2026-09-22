import { shelvePile } from "@/app/piles/actions";
import { ApiError, body, guardedJobRole, idAfter } from "@/lib/api";
import { loadShelfDraft } from "@/lib/pile-shelf";

/**
 * What "Put on shelf" shows: the Thaans back from Ironing that would become
 * stock, the ones already on the shelf, the record's current prices, the
 * locations stock can go to, and anything that stops it going yet.
 */
export const GET = guardedJobRole(
  ["Bale Custodian", "Handler", "Production Manager", "Operations Manager"],
  async (request) => {
    const draft = await loadShelfDraft(idAfter(request.url, "piles"));
    if (draft === null) throw new ApiError("No such pile.", 404);
    return draft;
  },
);

/**
 * Go live: `prices` in rupees as strings (retail required, others may be
 * ""), `locationId` the shelf. Every finished Thaan becomes a piece whose
 * code is its own; the pile is live from then on and can take more Thaans
 * onto the shelf later the same way.
 */
export const POST = guardedJobRole(["Bale Custodian", "Handler"], async (request) => {
  const id = idAfter(request.url, "piles");
  const raw = await body(request);
  const p = typeof raw.prices === "object" && raw.prices !== null ? (raw.prices as Record<string, unknown>) : {};
  const price = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : typeof p[k] === "number" ? String(p[k]) : "");

  const result = await shelvePile(id, {
    prices: { cost: price("cost"), making: price("making"), wholesale: price("wholesale"), retail: price("retail"), mrp: price("mrp") },
    locationId: typeof raw.locationId === "string" ? raw.locationId : "",
  });
  if (!result.ok) throw new ApiError(result.message, 422);

  return { message: result.message, productCode: result.productCode ?? null, pieceCodes: result.pieceCodes ?? [] };
});

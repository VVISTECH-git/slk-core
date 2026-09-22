import { shelveRecord } from "@/app/records/pipeline-actions";
import { ApiError, body, guarded, recordIdFrom } from "@/lib/api";
import { loadRecordShelf } from "@/lib/pipeline-records";

/**
 * What "Put on the shelf" shows: the Thaans back from Ironing that would
 * become stock, the ones already on the shelf, the record's current prices,
 * the locations stock can go to, and anything that stops it going yet.
 */
export const GET = guarded("floor", async (request) => {
  const shelf = await loadRecordShelf(recordIdFrom(request.url));
  if (shelf === null) throw new ApiError("No such record.", 404);
  return shelf;
});

/**
 * Go live: `prices` in rupees as strings (retail required, others may be
 * ""), `locationId` the shelf. Every finished Thaan becomes a piece whose
 * code is its own; more can follow the same way as they finish.
 */
export const POST = guarded("floor", async (request) => {
  const raw = await body(request);
  const p = typeof raw.prices === "object" && raw.prices !== null ? (raw.prices as Record<string, unknown>) : {};
  const price = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : typeof p[k] === "number" ? String(p[k]) : "");

  const result = await shelveRecord(recordIdFrom(request.url), {
    prices: { cost: price("cost"), making: price("making"), wholesale: price("wholesale"), retail: price("retail"), mrp: price("mrp") },
    locationId: typeof raw.locationId === "string" ? raw.locationId : "",
  });
  if (!result.ok) throw new ApiError(result.message, 422);

  return { message: result.message, productCode: result.productCode ?? null, pieceCodes: result.pieceCodes ?? [] };
});

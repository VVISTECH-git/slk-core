import { receiveBatch, type ReceiveRecord } from "@/app/handovers/actions";
import { ApiError, body, guardedJobRole } from "@/lib/api";

/**
 * A lorry-load in one tap: one transaction, a few queries per Thaan, so a
 * batch of a few hundred needs longer than the platform's default window.
 * Cut short, the whole receive rolls back and the phone shows an error.
 */
export const maxDuration = 300;

/**
 * Marks a scanned batch received, and bills whatever came back from a
 * vendor — wraps the same action the web Receive screen's confirm button
 * calls, including the same automatic billing at the vendor's rate.
 *
 * Optionally, from Print onward, sorts Thaans into Product Management
 * records: `records: [{ colourwayId } | { newRecord: { colourId,
 * secondaryColourId?, motifCategoryId, motifId } }, thaanIds ]`. A new
 * record is made in the same transaction, from the colour and motif given
 * here and everything the bale's cloth item already knew.
 *
 * Gated by job role, not Role — see handovers/page.tsx's own HANDOVER_JOB_ROLES.
 */
export const POST = guardedJobRole(["Bale Custodian", "Handler"], async (request) => {
  const raw = await body(request);
  const thaanIds = Array.isArray(raw.thaanIds) ? raw.thaanIds.map(String) : [];

  const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
  const records: ReceiveRecord[] = Array.isArray(raw.records)
    ? raw.records.flatMap((r: unknown): ReceiveRecord[] => {
        if (typeof r !== "object" || r === null) return [];
        const o = r as Record<string, unknown>;
        const nr = typeof o.newRecord === "object" && o.newRecord !== null ? (o.newRecord as Record<string, unknown>) : null;
        const colourId = nr === null ? null : str(nr.colourId);
        const motifCategoryId = nr === null ? null : str(nr.motifCategoryId);
        const motifId = nr === null ? null : str(nr.motifId);
        if (nr !== null && (colourId === null || motifCategoryId === null || motifId === null)) {
          throw new ApiError("A new record needs a colour, a motif category and a motif.", 422);
        }
        return [{
          colourwayId: str(o.colourwayId),
          newRecord: nr === null ? null : {
            colourId: colourId!,
            secondaryColourId: str(nr.secondaryColourId),
            motifCategoryId: motifCategoryId!,
            motifId: motifId!,
          },
          thaanIds: Array.isArray(o.thaanIds) ? o.thaanIds.map(String) : [],
        }];
      })
    : [];

  const result = await receiveBatch(thaanIds, records);
  if (!result.ok) throw new ApiError(result.message, 422);

  return { message: result.message };
});

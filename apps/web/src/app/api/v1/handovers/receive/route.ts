import { receiveBatch, type ReceivePile } from "@/app/handovers/actions";
import { ApiError, body, guardedJobRole } from "@/lib/api";

/**
 * Marks a scanned batch received, and bills whatever came back from a
 * vendor — wraps the same action the web Receive screen's confirm button
 * calls, including the same automatic billing at the vendor's rate.
 *
 * Gated by job role, not Role — see handovers/page.tsx's own HANDOVER_JOB_ROLES.
 */
export const POST = guardedJobRole(["Bale Custodian", "Handler"], async (request) => {
  const raw = await body(request);
  const thaanIds = Array.isArray(raw.thaanIds) ? raw.thaanIds.map(String) : [];

  // Optional, from Print onward: `piles: [{ pileId } | { newPile: { name, mainColourId, photoKey } }, thaanIds ]`.
  const piles: ReceivePile[] = Array.isArray(raw.piles)
    ? raw.piles.flatMap((p: unknown): ReceivePile[] => {
        if (typeof p !== "object" || p === null) return [];
        const o = p as Record<string, unknown>;
        const np = typeof o.newPile === "object" && o.newPile !== null ? (o.newPile as Record<string, unknown>) : null;
        return [{
          pileId: typeof o.pileId === "string" && o.pileId !== "" ? o.pileId : null,
          newPile: np === null ? null : {
            name: typeof np.name === "string" ? np.name : "",
            mainColourId: typeof np.mainColourId === "string" && np.mainColourId !== "" ? np.mainColourId : null,
            photoKey: typeof np.photoKey === "string" && np.photoKey !== "" ? np.photoKey : null,
          },
          thaanIds: Array.isArray(o.thaanIds) ? o.thaanIds.map(String) : [],
        }];
      })
    : [];

  const result = await receiveBatch(thaanIds, piles);
  if (!result.ok) throw new ApiError(result.message, 422);

  return { message: result.message };
});

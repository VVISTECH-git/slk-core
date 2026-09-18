import { ApiError, guardedJobRole } from "@/lib/api";
import { loadLatestHandoverForThaan } from "@/lib/thaan-damage";
import { loadThaanByCode } from "@/lib/thaans";

/**
 * One Thaan's own details, by the code its QR label carries — what scanning
 * a printed label on mobile resolves to. Bale Custodian and Handler both
 * have reason to scan one and see what it is: Bale Custodian generates and
 * prints these, Handler moves them through Handovers.
 *
 * Also carries who most recently held it and for which stage
 * (`lastVendorId`/`lastVendorName`/`lastStage`, all null if it has no
 * handover history yet) — the scan screen's "Flag as damaged" action
 * pre-fills from this rather than a second round trip.
 */
export const GET = guardedJobRole(["Bale Custodian", "Handler"], async (request) => {
  const code = new URL(request.url).searchParams.get("code")?.trim() ?? "";
  if (code === "") throw new ApiError("Pass ?code=.", 400);

  const thaan = await loadThaanByCode(code);
  if (thaan === null) throw new ApiError(`No Thaan with code "${code}".`, 404);

  const latest = await loadLatestHandoverForThaan(thaan.id);

  return {
    ...thaan,
    lastVendorId: latest?.vendorId ?? null,
    lastVendorName: latest?.vendorName ?? null,
    lastStage: latest?.stage ?? null,
  };
});

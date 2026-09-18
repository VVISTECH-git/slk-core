import { guardedJobRole, idAfter } from "@/lib/api";
import { loadDamagedThaansForVendor } from "@/lib/thaan-damage";

/**
 * Every Thaan ever flagged damaged against this vendor — mobile's
 * per-vendor detail screen.
 *
 * Literal role list, not vendors/actions.ts's own `FINANCE_JOB_ROLES` — see
 * ../../finance/route.ts's comment on why that import breaks the build
 * from a route handler. Must still match `FINANCE_JOB_ROLES` by hand.
 */
export const GET = guardedJobRole(["Finance Manager"], async (request) => {
  const id = idAfter(request.url, "vendors");
  return loadDamagedThaansForVendor(id);
});

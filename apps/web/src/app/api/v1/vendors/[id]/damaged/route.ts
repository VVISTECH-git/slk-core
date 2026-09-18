import { FINANCE_JOB_ROLES } from "@/app/vendors/actions";
import { guardedJobRole, idAfter } from "@/lib/api";
import { loadDamagedThaansForVendor } from "@/lib/thaan-damage";

/** Every Thaan ever flagged damaged against this vendor — mobile's per-vendor detail screen. */
export const GET = guardedJobRole(FINANCE_JOB_ROLES, async (request) => {
  const id = idAfter(request.url, "vendors");
  return loadDamagedThaansForVendor(id);
});

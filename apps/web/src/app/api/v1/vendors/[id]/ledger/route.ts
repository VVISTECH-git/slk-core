import { FINANCE_JOB_ROLES } from "@/app/vendors/actions";
import { guardedJobRole, idAfter } from "@/lib/api";
import { loadVendorLedger } from "@/lib/vendors";

/** One vendor's own billing history — transactions and payments, newest first. Mobile's per-vendor detail screen. */
export const GET = guardedJobRole(FINANCE_JOB_ROLES, async (request) => {
  const id = idAfter(request.url, "vendors");
  return loadVendorLedger(id);
});

import { FINANCE_JOB_ROLES } from "@/app/vendors/actions";
import { guardedJobRole } from "@/lib/api";
import { loadVendors } from "@/lib/vendors";

/**
 * Every vendor with what's owed and what's been paid — mobile Finance
 * Manager's own vendor list, the same rows the web Vendors page shows.
 * A different path from `/vendors` (not the same route with a richer
 * response): that one is gated to Bale Custodian/Handler for the Send
 * picker and deliberately carries none of this vendor's money, which a
 * floor phone sending a batch has no reason to read.
 */
export const GET = guardedJobRole(FINANCE_JOB_ROLES, () => loadVendors());

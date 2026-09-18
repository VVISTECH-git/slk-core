import { requireJobRolePage } from "@/lib/session";
import { loadVendors } from "@/lib/vendors";

import { Vendors } from "./vendors";

export const dynamic = "force-dynamic";

/** Who may see and manage vendors — see requireJobRolePage. Must match vendors/actions.ts's FINANCE_JOB_ROLES. */
const FINANCE_JOB_ROLES = ["Finance Manager"];

/**
 * Who does a stage of processing, ahead of the pipeline that will use this
 * list — see `packages/db/src/schema/production.ts`.
 */
export default async function VendorsPage() {
  await requireJobRolePage(FINANCE_JOB_ROLES);

  return <Vendors rows={await loadVendors()} />;
}

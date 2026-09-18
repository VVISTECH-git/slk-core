import { requireJobRolePage } from "@/lib/session";
import { loadAllVendorLedgers } from "@/lib/vendors";

import { VendorLedger } from "./vendor-ledger";

export const dynamic = "force-dynamic";

/** Who may see and settle vendor billing — see requireJobRolePage. Must match vendors/actions.ts's FINANCE_JOB_ROLES. */
const FINANCE_JOB_ROLES = ["Finance Manager"];

/**
 * Every vendor's billing together — what's been billed for a stage's work
 * and what's actually been paid, across the whole business rather than one
 * vendor's own drawer at a time. Finance-only, same as recording a payment
 * or setting a rate already are (`@/app/vendors/actions.ts`) — this is
 * money moving, not floor work.
 */
export default async function VendorLedgerPage() {
  await requireJobRolePage(FINANCE_JOB_ROLES);

  return <VendorLedger rows={await loadAllVendorLedgers()} />;
}

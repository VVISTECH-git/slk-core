import { requirePage } from "@/lib/session";
import { loadFinancialOverview } from "@/lib/vendors";

import { FinancialDashboard } from "./finance";

export const dynamic = "force-dynamic";

/**
 * Vendor billing and payments, rolled up into trends instead of Vendor
 * Ledger's row-at-a-time list. Office-only, same tier as the ledger it
 * summarises — this is still money, just viewed from further back.
 */
export default async function FinancePage() {
  await requirePage("office");

  return <FinancialDashboard data={await loadFinancialOverview()} />;
}

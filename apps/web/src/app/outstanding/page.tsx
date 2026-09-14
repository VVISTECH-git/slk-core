import { requirePage } from "@/lib/session";
import { loadOutstanding } from "@/lib/handovers";

import { Outstanding } from "./outstanding";

export const dynamic = "force-dynamic";

/**
 * Every Thaan currently out for a stage, grouped by stage and vendor — its
 * own page rather than a section on Handovers, so scanning stays the
 * point of that page instead of it also carrying a table that grows as
 * more stages and vendors come into use.
 */
export default async function OutstandingPage() {
  await requirePage();

  return <Outstanding rows={await loadOutstanding()} />;
}

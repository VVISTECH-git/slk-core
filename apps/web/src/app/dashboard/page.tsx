import { loadBaleStageHeatmap } from "@/lib/bales";
import { requirePage } from "@/lib/session";

import { Dashboard } from "./dashboard";

export const dynamic = "force-dynamic";

/**
 * The landing page: every bale's Thaans, how many are cut, and — of the cut
 * ones — which stage each group currently sits at. A different cut through
 * the same handover data Thaans and Handovers already show one Thaan at a
 * time, surfaced first since it's the one screen that answers "what's the
 * state of everything" in one look.
 */
export default async function DashboardPage() {
  await requirePage();

  return <Dashboard rows={await loadBaleStageHeatmap()} />;
}

import { loadBaleStageHeatmap } from "@/lib/bales";
import { requirePage } from "@/lib/session";

import { BaleProgress } from "./bale-progress";

export const dynamic = "force-dynamic";

/**
 * Where every bale's thaans currently sit, one row per bale — how many are
 * cut and how many aren't, and of the cut ones, which stage each group is
 * at. A different cut through the same handover data Thaans and Handovers
 * already show one thaan at a time.
 */
export default async function BaleProgressPage() {
  await requirePage();

  return <BaleProgress rows={await loadBaleStageHeatmap()} />;
}

import { loadBaleStageHeatmap } from "@/lib/bales";
import { requirePage } from "@/lib/session";

import { Dashboard } from "./dashboard/dashboard";

export const dynamic = "force-dynamic";

/**
 * The landing page itself — not a redirect to one. Every bale's Thaans, how
 * many are cut, and which stage each group currently sits at. A redirect
 * here means every visit costs two round trips instead of one, and on a
 * flaky connection the first of those two is exactly where it can fail.
 */
export default async function Home() {
  await requirePage();

  return <Dashboard rows={await loadBaleStageHeatmap()} />;
}

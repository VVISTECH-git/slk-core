import { redirect } from "next/navigation";

import { loadBaleStageHeatmap } from "@/lib/bales";
import { currentActor, homeFor } from "@/lib/session";

import { Dashboard } from "./dashboard/dashboard";

export const dynamic = "force-dynamic";

/**
 * The landing page itself — not a redirect to one. Every bale's Thaans, how
 * many are cut, and which stage each group currently sits at. A redirect
 * here means every visit costs two round trips instead of one, and on a
 * flaky connection the first of those two is exactly where it can fail.
 */
export default async function Home() {
  const who = await currentActor();
  if (who === null) redirect("/login");
  // The dashboard is Admin's; everyone else goes straight to their own page
  // rather than to a "not for you" screen the moment they sign in.
  const home = homeFor(who);
  if (home !== "/") redirect(home);

  return <Dashboard rows={await loadBaleStageHeatmap()} />;
}

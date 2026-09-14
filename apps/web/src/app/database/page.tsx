import { requirePage } from "@/lib/session";
import { loadDbUsage } from "@/lib/db-usage";

import { DbUsageView } from "./database-view";

export const dynamic = "force-dynamic";

export default async function DatabasePage() {
  // Office and up — same reasoning as Storage: not floor territory, not
  // owner-only either, a diagnostic anyone running Master Lists would
  // reasonably want.
  await requirePage("office");

  return <DbUsageView usage={await loadDbUsage()} />;
}

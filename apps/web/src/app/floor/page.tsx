import { loadBaleStageHeatmap } from "@/lib/bales";
import { requireJobRolePage } from "@/lib/session";

import { FloorBoard } from "./floor-board";

export const dynamic = "force-dynamic";

export const metadata = { title: "Floor Monitor" };

/**
 * The floor monitor: the Kora-to-Shelf pipeline for a screen on the wall.
 * Same numbers as the Dashboard's stage chart, printed large enough to read
 * from across the room, with no sidebar and nothing to hover. It refreshes
 * itself every minute (see FloorBoard), so the screen is left open all day.
 *
 * Anyone on the floor may look — the same roles that may list pipeline
 * records — and Admin, always.
 */
export default async function FloorPage() {
  await requireJobRolePage(["Bale Custodian", "Handler", "Production Manager", "Operations Manager"]);
  const rows = await loadBaleStageHeatmap();
  return <FloorBoard rows={rows} loadedAt={new Date().toISOString()} />;
}

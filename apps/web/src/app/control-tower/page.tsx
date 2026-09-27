import { loadControlTower } from "@/lib/control-tower";
import { requireJobRolePage } from "@/lib/session";

import { ControlTower } from "./tower";

export const dynamic = "force-dynamic";

export const metadata = { title: "Control Tower" };

/**
 * The Control Tower: every Thaan's life cycle on one screen, judged against
 * the turnaround standard, for a monitor on the floor. No sidebar, nothing
 * to hover, refreshes itself every minute (see ControlTower).
 *
 * Anyone who runs the floor may watch it — the same roles that may list
 * pipeline records — and Admin, always.
 */
export default async function ControlTowerPage() {
  await requireJobRolePage(["Bale Custodian", "Handler", "Production Manager", "Operations Manager"]);
  return <ControlTower snap={await loadControlTower()} />;
}

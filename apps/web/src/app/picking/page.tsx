import { requirePage } from "@/lib/session";
import { loadOpenReservations } from "@/lib/reservations";

import { Picking } from "./picking";

export const dynamic = "force-dynamic";

export default async function PickingPage() {
  // Floor, not owner — packing an order is exactly the kind of thing
  // whoever is holding the phone or standing at the shelf does, same as
  // any other movement.
  await requirePage("floor");

  return <Picking rows={await loadOpenReservations()} />;
}

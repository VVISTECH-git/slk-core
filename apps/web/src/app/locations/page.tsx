import { requirePage } from "@/lib/session";
import { loadLocations } from "@/lib/locations";

import { Locations } from "./locations";

export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  await requirePage();

  return <Locations locations={await loadLocations()} />;
}

import { loadLocations } from "@/lib/locations";

import { Locations } from "./locations";

export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  return <Locations locations={await loadLocations()} />;
}

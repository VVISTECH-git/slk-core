import { loadLocations } from "@/lib/locations";
import { loadAllValues, loadLists } from "@/lib/vocabulary";

import { Directory } from "./directory";

export const dynamic = "force-dynamic";

export default async function MasterListsPage() {
  const [lists, values, locations] = await Promise.all([
    loadLists(),
    loadAllValues(),
    loadLocations(),
  ]);

  const attention = lists.reduce((sum, l) => sum + l.attention, 0);

  return (
    <Directory
      lists={lists}
      values={values}
      attention={attention}
      locations={{
        count: locations.length,
        names: locations.filter((l) => l.isActive).map((l) => l.name),
      }}
    />
  );
}

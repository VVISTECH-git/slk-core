import { loadOptions } from "@/lib/editor";
import { loadPickableLocations } from "@/lib/locations";
import { loadRecords } from "@/lib/records";

import { RecordsTable } from "./records-table";

export const dynamic = "force-dynamic";

export default async function RecordsPage() {
  const [rows, options, locations] = await Promise.all([
    // Archived included, hidden by the grid until asked for. Stock against an
    // archived record has to be reachable from somewhere, and this is the
    // screen it belongs on.
    loadRecords({ includeArchived: true }),
    loadOptions(),
    loadPickableLocations(),
  ]);

  // Off the live records only: an industry that exists solely on something
  // archived is not one the filter should offer.
  const industries = [
    ...new Set(
      rows
        .filter((r) => !r.isArchived)
        .map((r) => r.industry)
        .filter((i): i is string => i !== null),
    ),
  ].sort();

  return (
    <RecordsTable
      rows={rows}
      industries={industries}
      options={options}
      locations={locations}
    />
  );
}

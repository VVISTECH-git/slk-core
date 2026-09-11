import { requirePage } from "@/lib/session";
import { loadOptions } from "@/lib/editor";
import { loadPickableLocations } from "@/lib/locations";
import { loadIndustries, loadRecordPage } from "@/lib/records";

import { RecordsTable } from "./records-table";

export const dynamic = "force-dynamic";

/**
 * The search, the industry and whether archived records are wanted live in
 * the URL — ?q=300021 — so the server can answer them. A visit fetches the
 * newest hundred that match; a code typed into the box finds its record
 * wherever it is in the catalogue.
 */
export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; industry?: string; archived?: string; status?: string }>;
}) {
  const who = await requirePage();

  const params = await searchParams;
  const initial = {
    q: (params.q ?? "").trim(),
    industry: (params.industry ?? "").trim(),
    archived: params.archived === "1",
    status: (params.status ?? "").trim(),
  };

  const [page, industries, options, locations] = await Promise.all([
    loadRecordPage(initial),
    loadIndustries(),
    loadOptions(),
    loadPickableLocations(),
  ]);

  return (
    <RecordsTable
      page={page}
      initial={initial}
      industries={industries}
      options={options}
      locations={locations}
      role={who.role}
    />
  );
}

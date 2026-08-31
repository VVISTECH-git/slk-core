import { loadRecords } from "@/lib/records";

import { RecordsTable } from "./records-table";

export const dynamic = "force-dynamic";

export default async function RecordsPage() {
  const rows = await loadRecords();

  const industries = [
    ...new Set(rows.map((r) => r.industry).filter((i): i is string => i !== null)),
  ].sort();

  return <RecordsTable rows={rows} industries={industries} />;
}

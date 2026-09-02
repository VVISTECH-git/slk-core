import { requirePage } from "@/lib/session";
import { loadPieces } from "@/lib/pieces";

import { StockRecords } from "./stock-records";

export const dynamic = "force-dynamic";

export default async function StockPage() {
  await requirePage();

  const pieces = await loadPieces();

  // The locations stock is actually in, rather than every location on file.
  // A dropdown offering a warehouse that holds nothing is a way to make the
  // table go empty and wonder what you broke.
  const locations = [
    ...new Set(pieces.map((p) => p.location).filter((l): l is string => l !== null)),
  ].sort();

  return <StockRecords pieces={pieces} locations={locations} />;
}

import { requirePage } from "@/lib/session";
import { loadPieces, loadStockLocations, type PieceQuery } from "@/lib/pieces";

import { StockRecords } from "./stock-records";

export const dynamic = "force-dynamic";

/**
 * The search, the location and the status live in the URL — ?q=300021 —
 * so the server can answer them. The page used to hand the browser every
 * piece ever minted and let it search; at thirty thousand pieces that never
 * finished loading. Now a visit fetches the newest hundred that match, and
 * a code typed into the box finds its piece wherever it is.
 */
export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; location?: string; kept?: string }>;
}) {
  await requirePage();

  const params = await searchParams;
  const kept: NonNullable<PieceQuery["kept"]> =
    params.kept === "gone" || params.kept === "all" ? params.kept : "held";

  const initial = {
    q: (params.q ?? "").trim(),
    location: (params.location ?? "").trim(),
    kept,
  };

  const [page, locations] = await Promise.all([
    loadPieces(initial),
    loadStockLocations(),
  ]);

  return <StockRecords page={page} locations={locations} initial={initial} />;
}

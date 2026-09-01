import { loadPieces } from "@/lib/pieces";

import { StockRecords } from "./stock-records";

export const dynamic = "force-dynamic";

export default async function StockPage() {
  return <StockRecords pieces={await loadPieces()} />;
}

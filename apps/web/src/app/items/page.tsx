import { requirePage } from "@/lib/session";
import { loadClothItems } from "@/lib/bales";

import { ClothItems } from "./items";

export const dynamic = "force-dynamic";

/**
 * Kora to Shelf's own cloth item list — the specific names a bale's
 * contents are picked from ("Cotton Fabric A40s"), matching the
 * spreadsheet's own maintained "Item Name" dropdown rather than free text.
 * Independent of the catalogue's vocabulary; see
 * `packages/db/src/schema/production.ts`.
 */
export default async function ItemsPage() {
  await requirePage();

  return <ClothItems rows={await loadClothItems()} />;
}

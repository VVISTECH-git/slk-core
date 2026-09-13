import { requirePage } from "@/lib/session";
import { loadSuppliers } from "@/lib/bales";

import { Suppliers } from "./suppliers";

export const dynamic = "force-dynamic";

/**
 * Kora to Shelf's own supplier list — who kora cloth is bought from, and
 * the letter that prefixes their bale codes (A3 for APA's third bale).
 * Independent of the catalogue's vocabulary; see
 * `packages/db/src/schema/production.ts`.
 */
export default async function SuppliersPage() {
  await requirePage();

  return <Suppliers rows={await loadSuppliers()} />;
}

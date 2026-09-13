import { requirePage } from "@/lib/session";
import { loadBales } from "@/lib/bales";

import { Bales } from "./bales";

export const dynamic = "force-dynamic";

/**
 * Kora to Shelf, step one: receiving a bale.
 *
 * The only screen this pipeline has so far. Cutting, QR codes and the
 * handover ledger come later, once this is confirmed working — see
 * docs/decisions/0002-a-piece-can-exist-before-its-product-does.md.
 */
export default async function BalesPage() {
  await requirePage();

  return <Bales rows={await loadBales()} />;
}

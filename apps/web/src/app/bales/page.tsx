import { requireJobRolePage } from "@/lib/session";
import { loadBales, loadClothItems, loadSuppliers } from "@/lib/bales";

import { Bales } from "./bales";

export const dynamic = "force-dynamic";

/** Who may receive, cut and track bales — see requireJobRolePage. */
const BALE_JOB_ROLES = ["Bale Custodian"];

/**
 * Kora to Shelf, step one: receiving a bale.
 *
 * The only screen this pipeline has so far. Cutting, QR codes and the
 * handover ledger come later, once this is confirmed working — see
 * docs/decisions/0002-a-piece-can-exist-before-its-product-does.md.
 */
export default async function BalesPage() {
  await requireJobRolePage(BALE_JOB_ROLES);

  const [rows, suppliers, clothItems] = await Promise.all([
    loadBales(),
    loadSuppliers(),
    loadClothItems(),
  ]);

  return <Bales rows={rows} suppliers={suppliers} clothItems={clothItems} />;
}

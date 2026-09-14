import { requirePage } from "@/lib/session";
import { loadOutstanding } from "@/lib/handovers";
import { loadVendors } from "@/lib/vendors";

import { Handovers } from "./handovers";

export const dynamic = "force-dynamic";

/**
 * Kora to Shelf, step three: a Thaan's trip through the stage pipeline.
 * Scan to send it off, scan to bring it back — see
 * `packages/db/src/schema/production.ts` for the shape underneath this.
 */
export default async function HandoversPage() {
  await requirePage();

  const [vendors, outstanding] = await Promise.all([loadVendors(), loadOutstanding()]);

  return <Handovers vendors={vendors} outstanding={outstanding} />;
}

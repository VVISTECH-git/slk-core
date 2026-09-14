import { requirePage } from "@/lib/session";
import { loadVendors } from "@/lib/vendors";

import { Handovers } from "./handovers";

export const dynamic = "force-dynamic";

/**
 * Kora to Shelf, step three: a Thaan's trip through the stage pipeline.
 * Scan to send it off, scan to bring it back — see
 * `packages/db/src/schema/production.ts` for the shape underneath this.
 * What's currently out lives on its own page (`/outstanding`) rather than
 * here, so this stays just the scanning.
 */
export default async function HandoversPage() {
  await requirePage();

  return <Handovers vendors={await loadVendors()} />;
}

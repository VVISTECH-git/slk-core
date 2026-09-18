import { requireJobRolePage } from "@/lib/session";
import { loadVendors } from "@/lib/vendors";

import { Handovers } from "./handovers";

export const dynamic = "force-dynamic";

/**
 * Who may scan a Thaan out and back — Bale Custodian too, not just Handler:
 * whoever received the bale in the first place is exactly who is already
 * standing at the first handover of it. See requireJobRolePage.
 */
const HANDOVER_JOB_ROLES = ["Bale Custodian", "Handler"];

/**
 * Kora to Shelf, step three: a Thaan's trip through the stage pipeline.
 * Scan to send it off, scan to bring it back — see
 * `packages/db/src/schema/production.ts` for the shape underneath this.
 * What's currently out lives on its own page (`/outstanding`) rather than
 * here, so this stays just the scanning.
 */
export default async function HandoversPage() {
  await requireJobRolePage(HANDOVER_JOB_ROLES);

  return <Handovers vendors={await loadVendors()} />;
}

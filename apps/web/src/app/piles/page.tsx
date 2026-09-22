import { requireJobRolePage } from "@/lib/session";
import { loadPiles } from "@/lib/piles";

import { Piles } from "./piles";

export const dynamic = "force-dynamic";

/**
 * Who may see piles: the two roles that make them at the door (matching
 * piles/actions.ts's PILE_JOB_ROLES), plus the managers who read the
 * pipeline — see requireJobRolePage. Admin passes as always.
 */
const PILE_JOB_ROLES = ["Bale Custodian", "Handler", "Production Manager", "Operations Manager"];

/**
 * Kora to Shelf, after Print: the Thaans that came back printed the same
 * way, grouped as the floor already groups them. Read-only here — a pile
 * is made on the phone as a Print delivery is received; this is where the
 * result is browsable, and where a wrong sort gets put right (see
 * `piles/[id]`). See `packages/db/src/schema/production.ts` (`pile`).
 */
export default async function PilesPage() {
  await requireJobRolePage(PILE_JOB_ROLES);

  return <Piles rows={await loadPiles()} />;
}

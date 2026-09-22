import { notFound } from "next/navigation";

import { hasAnyJobRole } from "@/lib/auth";
import { loadPile, loadPileColours, loadPiles } from "@/lib/piles";
import { requireJobRolePage } from "@/lib/session";

import { Pile } from "./pile";

export const dynamic = "force-dynamic";

/** Same gate as the list — see piles/page.tsx. */
const PILE_JOB_ROLES = ["Bale Custodian", "Handler", "Production Manager", "Operations Manager"];

/** Who may change a pile — matches piles/actions.ts's PILE_JOB_ROLES, so the screen never offers what the action refuses. */
const PILE_EDIT_JOB_ROLES = ["Bale Custodian", "Handler"];

/**
 * One pile: its photo, its name and colour (the two things fixed at the
 * door that can be wrong), every Thaan in it and where each is now, and
 * everything that ever happened to it. Its own page rather than a drawer
 * because the Thaans and the history are read on the server, and a page
 * gets both back for free on every `router.refresh()`.
 */
export default async function PilePage({ params }: { params: Promise<{ id: string }> }) {
  const who = await requireJobRolePage(PILE_JOB_ROLES);

  const { id } = await params;
  const [pile, colours, piles] = await Promise.all([loadPile(id), loadPileColours(), loadPiles()]);
  if (pile === null) notFound();

  return (
    <Pile
      pile={pile}
      colours={colours}
      others={piles.filter((p) => p.id !== pile.id)}
      canEdit={hasAnyJobRole(who, PILE_EDIT_JOB_ROLES)}
    />
  );
}

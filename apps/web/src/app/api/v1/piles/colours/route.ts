import { guardedJobRole } from "@/lib/api";
import { loadPileColours } from "@/lib/piles";

/** Product Management's colour list — what a pile's main colour is picked from. */
export const GET = guardedJobRole(
  ["Bale Custodian", "Handler", "Production Manager", "Operations Manager"],
  async () => loadPileColours(),
);

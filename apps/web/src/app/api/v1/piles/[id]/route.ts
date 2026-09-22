import { ApiError, guardedJobRole, idAfter } from "@/lib/api";
import { loadPile } from "@/lib/piles";

/** One pile with its Thaans and its history. */
export const GET = guardedJobRole(
  ["Bale Custodian", "Handler", "Production Manager", "Operations Manager"],
  async (request) => {
    const pile = await loadPile(idAfter(request.url, "piles"));
    if (pile === null) throw new ApiError("No such pile.", 404);
    return pile;
  },
);

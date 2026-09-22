import { ApiError, guardedJobRole, idAfter } from "@/lib/api";
import { loadPileDraft } from "@/lib/pile-draft";

/**
 * What "Complete a pile" shows: the facts already known from the cloth
 * item (read-only), the questions this pile's stages so far decide
 * (editable, with the Master List each is picked from), and what's still
 * missing. Once the pile has a record, the current answers come from it.
 */
export const GET = guardedJobRole(
  ["Bale Custodian", "Handler", "Production Manager", "Operations Manager"],
  async (request) => {
    const draft = await loadPileDraft(idAfter(request.url, "piles"));
    if (draft === null) throw new ApiError("No such pile.", 404);
    return draft;
  },
);

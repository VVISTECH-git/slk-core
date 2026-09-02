import { guarded } from "@/lib/api";

/**
 * Who the caller is.
 *
 * The app asks this on launch to decide whether its stored token is still
 * good. Cheaper than discovering it isn't halfway through saving a record,
 * and it is what turns "signed in three weeks ago" into a live answer.
 */
export const GET = guarded("floor", async (_request, actor) =>
  Promise.resolve({
    id: actor.id,
    code: actor.code,
    name: actor.name,
    role: actor.role,
  }),
);

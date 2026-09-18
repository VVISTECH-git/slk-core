import { guardedSignedIn } from "@/lib/api";

/**
 * Who the caller is.
 *
 * The app asks this on launch to decide whether its stored token is still
 * good. Cheaper than discovering it isn't halfway through saving a record,
 * and it is what turns "signed in three weeks ago" into a live answer.
 *
 * Signed-in-only, deliberately not `guarded` — this is the check that
 * decides whether the phone stays signed in at all, so gating it behind a
 * job role would mean anyone without one gets bounced to the sign-in screen
 * on every launch despite a perfectly valid token.
 */
export const GET = guardedSignedIn(async (_request, actor) =>
  Promise.resolve({
    id: actor.id,
    code: actor.code,
    name: actor.name,
    role: actor.role,
    jobRoles: actor.jobRoles,
  }),
);

import { runReconciliation } from "@slk/sync/reconcile";

import { db } from "@/lib/db";

/**
 * The nightly correction pass, reached the way Vercel Cron reaches anything:
 * a plain HTTP GET, on the schedule in `vercel.json`, with no session and no
 * actor — so this is deliberately outside `guarded()`, which exists for a
 * signed-in person. What stands in for a session is `CRON_SECRET`: Vercel
 * sends it as `Authorization: Bearer <value>` on every scheduled invocation
 * once the variable is set, and this route is the only thing that checks it.
 *
 * Everything this actually does — recompute inventory, replay failed
 * webhooks — lives in `runReconciliation`, in `@slk/sync`, so a person
 * running the same pass by hand (`pnpm --filter @slk/sync reconcile`)
 * exercises the identical code, not a second copy of it.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env["CRON_SECRET"];
  if (secret === undefined || secret === "") {
    console.error("[cron/reconcile] CRON_SECRET is not set — refusing to run unauthenticated.");
    return new Response("Not configured.", { status: 503 });
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized.", { status: 401 });
  }

  try {
    const summary = await runReconciliation(db);
    console.log("[cron/reconcile]", JSON.stringify(summary));
    return Response.json(summary);
  } catch (error) {
    console.error("[cron/reconcile]", error);
    return new Response("Reconciliation failed.", { status: 500 });
  }
}

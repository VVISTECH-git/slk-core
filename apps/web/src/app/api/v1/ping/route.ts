/**
 * "Are you there?" — what the phone app asks every few seconds to decide
 * whether its connection light is green or red. Answers without a sign-in
 * and without touching the database, so it measures the network and the
 * server being up, nothing else, and costs almost nothing to call.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true, data: { at: new Date().toISOString() } }, { headers: { "cache-control": "no-store" } });
}

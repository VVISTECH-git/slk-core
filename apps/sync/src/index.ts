/**
 * @slk/sync — the channel bridge.
 *
 * The only process in the system that talks to Shopify. It pushes products,
 * images and per-channel stock levels out, and takes orders and refunds back
 * in, applying the per-channel transformation on the way out.
 *
 * Two rules this worker exists to enforce:
 *
 *   1. It never writes stock. It proposes movements to the core API and reads
 *      the result back. A cache here that believes it holds the count is the
 *      reconciliation problem the architecture is designed to avoid.
 *
 *   2. Inbound events are idempotent. Shopify will deliver a webhook twice and
 *      will occasionally not deliver one at all — both are normal, and the
 *      nightly reconciliation job is what covers the second case.
 *
 * Lives outside the Next.js app because it needs cron, retries and a queue
 * that outlives a request.
 */

async function main(): Promise<void> {
  console.log("[sync] channel bridge — not implemented yet");
}

main().catch((error: unknown) => {
  console.error("[sync] fatal", error);
  process.exitCode = 1;
});

export {};

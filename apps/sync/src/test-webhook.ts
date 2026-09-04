import { createHmac, randomUUID } from "node:crypto";

/**
 * Sends a realistic, correctly-signed fake Shopify webhook at the receiver,
 * without needing a real order to test against — proves signature
 * verification, parsing and the reservation write all work, the same way
 * publish-one proves the outbound path by hand before anything is automatic.
 *
 *   pnpm --filter @slk/sync test-webhook <channelCode> <topic> <productCode> [qty]
 *   e.g. pnpm --filter @slk/sync test-webhook aartisanz orders/create 300010 1
 *
 * topic is one of: orders/create, orders/cancelled, refunds/create
 *
 * Needs SHOPIFY_<CODE>_WEBHOOK_SECRET in the environment — the store-level
 * signing secret shown on Settings › Notifications › Webhooks, separate
 * from the app's Client Secret the outbound side uses.
 */

const [channelCode, topic, productCode, qtyArg] = process.argv.slice(2);

if (channelCode === undefined || topic === undefined || productCode === undefined) {
  console.error(
    "\n  Usage: pnpm --filter @slk/sync test-webhook <channelCode> <topic> <productCode> [qty]\n" +
      "  topic is one of: orders/create, orders/cancelled, refunds/create\n",
  );
  process.exit(1);
}

const PREFIX = channelCode.toUpperCase();
// The store-level signing secret shown on Settings › Notifications ›
// Webhooks — not the app's Client Secret, a separate value entirely.
const secret = process.env[`SHOPIFY_${PREFIX}_WEBHOOK_SECRET`];

if (secret === undefined || secret === "") {
  console.error(`\n  SHOPIFY_${PREFIX}_WEBHOOK_SECRET is not set.\n`);
  process.exit(1);
}

// Overridable for testing against a local dev server instead of prod.
const endpoint = (process.env["WEBHOOK_ENDPOINT"] ?? "https://slk-core.vercel.app").replace(/\/$/, "");
const qty = qtyArg === undefined ? 1 : Number(qtyArg);
const orderId = Math.floor(Math.random() * 1_000_000_000);

const payload =
  topic === "refunds/create"
    ? {
        order_id: orderId,
        refund_line_items: [{ line_item: { sku: productCode }, quantity: qty }],
      }
    : {
        id: orderId,
        name: `#TEST${String(orderId).slice(-4)}`,
        line_items: [{ sku: productCode, quantity: qty }],
      };

const raw = JSON.stringify(payload);
const signature = createHmac("sha256", secret).update(raw, "utf8").digest("base64");
const webhookId = randomUUID();

console.log(`\n  POST ${endpoint}/api/v1/webhooks/shopify/${channelCode}`);
console.log(`  topic: ${topic}`);
console.log(`  body: ${raw}\n`);

const res = await fetch(`${endpoint}/api/v1/webhooks/shopify/${channelCode}`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-shopify-hmac-sha256": signature,
    "x-shopify-topic": topic,
    "x-shopify-webhook-id": webhookId,
  },
  body: raw,
});

const text = await res.text();
console.log(`  → ${res.status} ${text}\n`);

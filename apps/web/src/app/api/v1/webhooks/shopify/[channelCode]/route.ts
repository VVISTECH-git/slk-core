import { createHmac, timingSafeEqual } from "node:crypto";

import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

/**
 * The other half of the bridge — orders and refunds arriving from Shopify,
 * turning into reservations. Never writes stock: nothing physical has
 * happened when an order is placed, so nothing is written to the ledger.
 * See the 3 Sep design ("An order reserves; packing moves").
 *
 * One URL per channel, the code in the path — `.../webhooks/shopify/aartisanz`
 * — rather than trying to reverse the shop domain Shopify sends back to a
 * channel row. Simpler, and it is what gets configured once, by hand, in
 * Shopify's own webhook settings; there is no API call in this codebase that
 * creates the subscription.
 *
 * Idempotent on Shopify's own event id (channel_event), because Shopify
 * delivers at least once and will occasionally deliver twice. A signature
 * that doesn't verify, or a channel that doesn't exist, is answered before
 * anything is read from the body.
 */

const HANDLED_TOPICS = new Set(["orders/create", "orders/cancelled", "refunds/create"]);

type ShopifyOrderPayload = {
  id: number | string;
  name?: string;
  line_items?: { sku: string | null; quantity: number }[];
};

type ShopifyRefundPayload = {
  order_id: number | string;
  refund_line_items?: { line_item?: { sku: string | null }; quantity: number }[];
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ channelCode: string }> },
): Promise<Response> {
  const { channelCode } = await params;

  const secret = process.env[`SHOPIFY_${channelCode.toUpperCase()}_CLIENT_SECRET`];
  // 404, not 401 — a channel that will never exist should not be retried
  // forever by whatever sent this.
  if (secret === undefined) return new Response("Unknown channel.", { status: 404 });

  const signature = request.headers.get("x-shopify-hmac-sha256");
  const topic = request.headers.get("x-shopify-topic");
  const webhookId = request.headers.get("x-shopify-webhook-id");

  if (signature === null || topic === null || webhookId === null) {
    return new Response("Missing Shopify headers.", { status: 400 });
  }

  // The raw bytes, not the parsed-and-reserialised object — HMAC is computed
  // over exactly what Shopify sent, and JSON.stringify(JSON.parse(x)) is not
  // guaranteed to equal x.
  const raw = await request.text();

  // Shopify signs with the app's Client Secret — the same one the
  // client_credentials exchange uses, not a separate webhook secret.
  const expected = createHmac("sha256", secret).update(raw, "utf8").digest("base64");
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature, "base64");

  const verified =
    expectedBuf.length === signatureBuf.length && timingSafeEqual(expectedBuf, signatureBuf);

  if (!verified) return new Response("Bad signature.", { status: 401 });

  const [channel] = await db.execute<{ id: string }>(sql`
    select id from channel where code = ${channelCode}
  `);
  if (channel === undefined) return new Response("Unknown channel.", { status: 404 });

  const [existing] = await db.execute<{ processed_at: string | null }>(sql`
    select processed_at from channel_event
    where channel_id = ${channel.id} and shopify_event_id = ${webhookId}
  `);
  if (existing !== undefined && existing.processed_at !== null) {
    return new Response("Already processed.", { status: 200 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return new Response("Bad JSON.", { status: 400 });
  }

  await db.execute(sql`
    insert into channel_event (channel_id, shopify_event_id, topic, payload)
    values (${channel.id}, ${webhookId}, ${topic}, ${JSON.stringify(payload)}::jsonb)
    on conflict (channel_id, shopify_event_id) do nothing
  `);

  if (!HANDLED_TOPICS.has(topic)) {
    // Subscribed to something this endpoint doesn't act on yet — logged as
    // received, nothing more to do. Not an error.
    await markProcessed(channel.id, webhookId);
    return new Response("OK — topic not handled.", { status: 200 });
  }

  try {
    if (topic === "orders/create") {
      await bookReservation(channel.id, payload as unknown as ShopifyOrderPayload, "held");
    } else if (topic === "orders/cancelled") {
      await bookReservation(channel.id, payload as unknown as ShopifyOrderPayload, "released");
    } else if (topic === "refunds/create") {
      await releaseRefundedLines(channel.id, payload as unknown as ShopifyRefundPayload);
    }

    await markProcessed(channel.id, webhookId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[webhook] ${channelCode} ${topic}`, error);

    await db.execute(sql`
      update channel_event set error = ${message}
      where channel_id = ${channel.id} and shopify_event_id = ${webhookId}
    `);

    /*
      Still 200. Shopify retries on anything else, and retrying a payload
      that failed for a reason baked into the payload itself (an unknown SKU,
      a malformed body) just repeats the same failure forever. The error
      column above is what a person, or the reconciliation job once one
      exists, needs to notice — not Shopify's retry loop.
    */
    return new Response("Recorded, handling failed.", { status: 200 });
  }

  return new Response("OK", { status: 200 });
}

async function markProcessed(channelId: string, webhookId: string): Promise<void> {
  await db.execute(sql`
    update channel_event set processed_at = now(), error = null
    where channel_id = ${channelId} and shopify_event_id = ${webhookId}
  `);
}

/**
 * One row per (channel, order, consignment) — matching reservation's own
 * unique key, so a second delivery of the same webhook updates this row
 * rather than doubling the hold.
 *
 * Line items are matched by SKU against `batch.code`: the product code is
 * what publish.ts set the SKU to, so this is the same identifier the floor
 * already reads off a label. A line item whose SKU matches nothing of ours
 * — a shipping charge, a bundle, a typo — is silently skipped rather than
 * failing the whole order.
 */
async function bookReservation(
  channelId: string,
  order: ShopifyOrderPayload,
  status: "held" | "released",
): Promise<void> {
  const externalOrderId = String(order.id);
  const externalOrderName = order.name ?? null;

  for (const item of order.line_items ?? []) {
    if (item.sku === null || item.sku === "") continue;

    const [batchRow] = await db.execute<{ id: string }>(sql`
      select id from batch where code = ${item.sku}
    `);
    if (batchRow === undefined) continue;

    await db.execute(sql`
      insert into reservation
        (channel_id, batch_id, external_order_id, external_order_name, qty, status)
      values
        (${channelId}, ${batchRow.id}, ${externalOrderId}, ${externalOrderName}, ${item.quantity}, ${status})
      on conflict (channel_id, external_order_id, batch_id) do update set
        qty = excluded.qty,
        status = excluded.status,
        updated_at = now()
    `);
  }
}

/**
 * A refund releases whatever hold that order still has on the refunded
 * consignments. Whether the piece had already shipped is not this table's
 * business — a physical return is a separate, staff-entered movement; this
 * only ends the reservation.
 */
async function releaseRefundedLines(
  channelId: string,
  refund: ShopifyRefundPayload,
): Promise<void> {
  const externalOrderId = String(refund.order_id);

  for (const item of refund.refund_line_items ?? []) {
    const sku = item.line_item?.sku;
    if (sku === null || sku === undefined || sku === "") continue;

    const [batchRow] = await db.execute<{ id: string }>(sql`
      select id from batch where code = ${sku}
    `);
    if (batchRow === undefined) continue;

    await db.execute(sql`
      update reservation set status = 'released', updated_at = now()
      where channel_id = ${channelId}
        and batch_id = ${batchRow.id}
        and external_order_id = ${externalOrderId}
        and status = 'held'
    `);
  }
}

import { sql } from "drizzle-orm";

import type { Database } from "@slk/db";

/**
 * What an order or a refund webhook actually does, factored out of the
 * route it arrives on so the nightly reconciliation can replay the same
 * logic against a `channel_event` row that failed the first time.
 *
 * Two callers, one behaviour. Before this the booking rules lived only
 * inside `apps/web/src/app/api/v1/webhooks/shopify/[channelCode]/route.ts`
 * as unexported functions — correct for the one thing that called them, and
 * unreachable for anything else, which is exactly the shape a retry needs
 * to not exist as a second, drifting copy of the same rules.
 */

type ShopifyOrderPayload = {
  id: number | string;
  name?: string;
  line_items?: { sku: string | null; quantity: number }[];
};

type ShopifyRefundPayload = {
  order_id: number | string;
  refund_line_items?: { line_item?: { sku: string | null }; quantity: number }[];
};

export const HANDLED_TOPICS = new Set(["orders/create", "orders/cancelled", "refunds/create"]);

/**
 * One row per (channel, order, consignment) — matching reservation's own
 * unique key, so a second delivery of the same webhook updates this row
 * rather than doubling the hold.
 *
 * Line items are matched by SKU against `batch.code`: the product code is
 * what `publish.ts` set the SKU to, so this is the same identifier the
 * floor already reads off a label. A line item whose SKU matches nothing
 * of ours — a shipping charge, a bundle, a typo — is silently skipped
 * rather than failing the whole order.
 */
export async function bookReservation(
  db: Database,
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
 * consignments — by the quantity actually refunded, not the whole
 * reservation. An order for 3 with 1 refunded leaves 2 still held; only a
 * refund that reaches the full quantity releases it.
 *
 * One atomic UPDATE rather than read-then-write: every expression in a
 * Postgres UPDATE's SET clause sees the row as it was before this
 * statement, so `qty` on the right of these CASEs is always the pre-refund
 * value even under concurrent refunds for the same order.
 */
export async function releaseRefundedLines(
  db: Database,
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
      update reservation set
        qty = case when qty - ${item.quantity} > 0 then qty - ${item.quantity} else qty end,
        status = case when qty - ${item.quantity} <= 0 then 'released' else 'held' end,
        updated_at = now()
      where channel_id = ${channelId}
        and batch_id = ${batchRow.id}
        and external_order_id = ${externalOrderId}
        and status = 'held'
    `);
  }
}

/** Runs whichever handler a topic maps to. Unhandled topics are a no-op. */
export async function handleWebhookPayload(
  db: Database,
  channelId: string,
  topic: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (topic === "orders/create") {
    await bookReservation(db, channelId, payload as unknown as ShopifyOrderPayload, "held");
  } else if (topic === "orders/cancelled") {
    await bookReservation(db, channelId, payload as unknown as ShopifyOrderPayload, "released");
  } else if (topic === "refunds/create") {
    await releaseRefundedLines(db, channelId, payload as unknown as ShopifyRefundPayload);
  }
}

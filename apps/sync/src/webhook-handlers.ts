import { sql } from "drizzle-orm";

import type { Database } from "@slk/db";

import { cancelAndRefundOrder } from "./cancel-and-refund";
import { shopifyClient } from "./shopify-client";

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
): Promise<string[]> {
  const externalOrderId = String(order.id);
  const externalOrderName = order.name ?? null;

  // Every batch this order touched — the caller runs the oversell guard
  // against these, and only these, so a webhook for one consignment does
  // not pay to re-rank every other held reservation in the system.
  const batchIds: string[] = [];

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

    batchIds.push(batchRow.id);
  }

  return batchIds;
}

// A type alias, not an interface: db.execute<T> requires T assignable to
// Record<string, unknown>, which an object type alias gets implicitly and
// an interface does not — see the same note on SellableRow in
// inventory-push.ts.
export type OversoldHold = {
  id: string;
  channelId: string;
  channelCode: string;
  externalOrderId: string;
  externalOrderName: string | null;
  batchId: string;
  qty: number;
};

/**
 * Which channel keeps the sale when a shared pool runs short. Bhanu and his
 * brother's own call (8 Sep 2026): aartisanz always wins, and the SLK order
 * that loses is the one `handleWebhookPayload` cancels and refunds
 * automatically — see the ranking in `demoteOversoldHolds` and the refund
 * call below. Not "whichever order is not aartisanz": with exactly two
 * channels today that is the same set, but the rule is stated as who wins,
 * not who loses, so a third channel added later has an explicit answer
 * (loses to aartisanz, does not get auto-refunded) rather than an implied
 * one.
 */
const POOL_PRIORITY_CHANNEL = "aartisanz";
const AUTO_REFUND_CHANNEL = "slk";

/**
 * Finds every held reservation that oversells its pool and releases it —
 * the guard `bookReservation`'s unconditional insert never had. Shopify
 * cannot ask this codebase for permission before it captures a customer's
 * payment, so two orders arriving within the same few seconds for the last
 * piece of a shared consignment can both land as `held` rows; nothing
 * before this noticed, or ever will on its own — a reservation table has no
 * constraint that can see across rows the way a CHECK sees across columns.
 *
 * Detects and corrects rather than preventing at write time. Preventing it
 * would need a real multi-statement transaction wrapped around the
 * check-and-insert, and every caller of this module runs on `db` — either
 * the pooled connection every Server Action in apps/web uses, which hangs
 * indefinitely on a second statement inside an explicit transaction (see
 * `packReservation`'s own comment on the exact same constraint), or the
 * direct connection `reconcile.ts` uses, which would make the fix depend on
 * which caller happened to invoke it. One single atomic statement, run
 * immediately after every booking, works under both and needs no lock:
 * every held reservation sharing a pool is ranked with `aartisanz` first,
 * then oldest first among whatever remains — see POOL_PRIORITY_CHANNEL —
 * and whichever ones push the running total past the pool's true physical
 * count are released. Idempotent and safe to call repeatedly: the nightly
 * reconciliation calls it too, over every batch with an open hold, as a
 * backstop for whatever this pass — running right after the webhook that
 * created the problem — still misses.
 *
 * Reuses `reservation.fulfillment_error` for the reason rather than adding
 * a column. That field is about a different failure today — Shopify
 * refused, or could not be reached, when this codebase told it an order
 * shipped — but a reservation released here never reaches that step, so
 * there is no collision, only two callers of the same "why this hold never
 * became a sale" slot.
 */
export async function demoteOversoldHolds(
  db: Database,
  batchIds: string[],
): Promise<OversoldHold[]> {
  if (batchIds.length === 0) return [];

  // sql`= any(${batchIds})` does not do what it looks like it does: the
  // postgres.js driver under drizzle does not serialise a plain JS array
  // into a Postgres array literal here, and Postgres then fails trying to
  // parse the first element as one — confirmed by actually running this
  // against a live batch, not assumed from the syntax looking right. A
  // parenthesised, individually-parameterised list is the pattern already
  // used everywhere else in this codebase for "match against several ids"
  // (see labelsFor in records/actions.ts) — sidesteps the array-binding
  // question entirely.
  const batchIdList = sql.join(
    batchIds.map((id) => sql`${id}`),
    sql`, `,
  );

  return db.execute<OversoldHold>(sql`
    with pool_on_hand as (
      select cp.pool_id, p.batch_id, count(distinct p.id)::int as qty
      from piece p
      join piece_position pp on pp.piece_id = p.id and pp.is_held
      join channel_location cl on cl.location_id = pp.location_id
      join channel_pool cp on cp.channel_id = cl.channel_id
      where p.batch_id in (${batchIdList})
      group by cp.pool_id, p.batch_id
    ),
    ranked as (
      select
        r.id, r.batch_id, r.channel_id, cp.pool_id,
        sum(r.qty) over (
          partition by cp.pool_id, r.batch_id
          order by (ch.code = ${POOL_PRIORITY_CHANNEL}) desc, r.created_at, r.id
        ) as running_total
      from reservation r
      join channel ch on ch.id = r.channel_id
      join channel_pool cp on cp.channel_id = r.channel_id
      where r.status = 'held' and r.batch_id in (${batchIdList})
    ),
    losers as (
      select ranked.id, ranked.channel_id
      from ranked
      join pool_on_hand
        on pool_on_hand.pool_id = ranked.pool_id and pool_on_hand.batch_id = ranked.batch_id
      where ranked.running_total > pool_on_hand.qty
    )
    update reservation r set
      status = 'released',
      fulfillment_error = 'Oversold — this piece was already committed to an order on the shared stock pool. Released automatically.',
      updated_at = now()
    from losers
    join channel ch on ch.id = losers.channel_id
    where r.id = losers.id
    returning
      r.id, losers.channel_id as "channelId", ch.code as "channelCode",
      r.external_order_id as "externalOrderId",
      r.external_order_name as "externalOrderName", r.batch_id as "batchId", r.qty
  `);
}

/**
 * Cancels and refunds the Shopify order behind a losing SLK hold — the
 * money-moving half `demoteOversoldHolds` deliberately does not do itself
 * (it only touches this codebase's own tables). Scoped to `AUTO_REFUND_CHANNEL`
 * specifically, not "every loser": that is the one case explicitly
 * authorized to move real customer money without a person looking at it
 * first, and a channel added later gets the safer default — released here,
 * left for a person to cancel by hand — until it is named too.
 *
 * Best-effort and logged, never thrown: a Shopify failure here must not be
 * why the webhook that triggered it fails, since the reservation itself is
 * already correctly released regardless. The reservation's own
 * fulfillment_error is updated afterwards either way, so a failed refund is
 * as visible on the Channels/Picking screens as any other push failure —
 * "released automatically" is not the same claim as "and the customer has
 * their money back", and the row should not say the second one unless it
 * is true.
 */
export async function refundLosingOrders(db: Database, losers: OversoldHold[]): Promise<void> {
  for (const loser of losers) {
    if (loser.channelCode !== AUTO_REFUND_CHANNEL) continue;

    let message: string;

    try {
      const client = await shopifyClient(AUTO_REFUND_CHANNEL);
      const result = await cancelAndRefundOrder(
        client,
        loser.externalOrderId,
        "Automatically cancelled — this piece was already committed to an order on the shared aartisanz/SLK stock pool.",
      );

      message = result.ok
        ? "Oversold — released; the Shopify order was cancelled and refunded automatically."
        : `Oversold — released, but the automatic cancel/refund failed: ${result.error}. Cancel it on Shopify by hand.`;

      if (!result.ok) {
        console.error(`[oversell] auto-refund failed for order ${loser.externalOrderId}: ${result.error}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      message = `Oversold — released, but the automatic cancel/refund failed: ${errorMessage}. Cancel it on Shopify by hand.`;
      console.error(`[oversell] auto-refund threw for order ${loser.externalOrderId}`, error);
    }

    await db.execute(sql`
      update reservation set fulfillment_error = ${message}, updated_at = now()
      where id = ${loser.id}
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

/**
 * Runs whichever handler a topic maps to, then the oversell guard — only
 * `orders/create` can ever create new competition for a piece already spoken
 * for, so it is the only branch that checks. Unhandled topics are a no-op.
 */
export async function handleWebhookPayload(
  db: Database,
  channelId: string,
  topic: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (topic === "orders/create") {
    const touched = await bookReservation(
      db,
      channelId,
      payload as unknown as ShopifyOrderPayload,
      "held",
    );

    const oversold = await demoteOversoldHolds(db, touched);
    for (const loser of oversold) {
      console.error(
        `[oversell] released ${loser.qty} of batch ${loser.batchId} held by ` +
          `channel ${loser.channelCode}, order ${loser.externalOrderName ?? loser.externalOrderId} — ` +
          `already committed to an order on the same shared stock.`,
      );
    }
    await refundLosingOrders(db, oversold);
  } else if (topic === "orders/cancelled") {
    await bookReservation(db, channelId, payload as unknown as ShopifyOrderPayload, "released");
  } else if (topic === "refunds/create") {
    await releaseRefundedLines(db, channelId, payload as unknown as ShopifyRefundPayload);
  }
}

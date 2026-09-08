import type { ShopifyClient } from "./shopify-client";

export interface CancelResult {
  ok: boolean;
  error?: string;
}

/**
 * Cancels a Shopify order and refunds whatever was paid on it.
 *
 * The only caller today is the oversell guard's SLK-loses-to-aartisanz
 * rule (see `webhook-handlers.ts`) — an order this codebase already knows
 * cannot be filled, because the piece it paid for went to the other store's
 * order on the same shared stock. `orderCancel` is Shopify's own single call
 * for "this order is not happening": it reverses the payment and marks the
 * order cancelled together, rather than this codebase trying to compose a
 * refund and a cancellation itself out of smaller calls that could succeed
 * separately and disagree with each other.
 *
 * `restock: false` — this codebase's own inventory push already sets
 * Shopify's count directly, as an absolute number, every time the ledger
 * changes. Letting Shopify additionally "restock" the cancelled line by its
 * own arithmetic would only add a second, independent adjustment that the
 * next real push overwrites anyway; it is not the fix for what this piece
 * should now read.
 */
export async function cancelAndRefundOrder(
  client: ShopifyClient,
  externalOrderId: string,
  staffNote: string,
): Promise<CancelResult> {
  const orderId = externalOrderId.startsWith("gid://")
    ? externalOrderId
    : `gid://shopify/Order/${externalOrderId}`;

  try {
    const CANCEL = `
      mutation OrderCancel(
        $orderId: ID!
        $notifyCustomer: Boolean
        $reason: OrderCancelReason!
        $refund: Boolean!
        $restock: Boolean!
        $staffNote: String
      ) {
        orderCancel(
          orderId: $orderId
          notifyCustomer: $notifyCustomer
          reason: $reason
          refund: $refund
          restock: $restock
          staffNote: $staffNote
        ) {
          job { id done }
          orderCancelUserErrors { field message code }
        }
      }
    `;

    const result = await client.graphql<{
      orderCancel: {
        job: { id: string; done: boolean } | null;
        orderCancelUserErrors: { field: string[] | null; message: string; code: string }[];
      };
    }>(CANCEL, {
      orderId,
      // True, not omitted: the customer paid for something that will never
      // arrive, and finding that out only from their bank statement is worse
      // than a Shopify email saying so immediately.
      notifyCustomer: true,
      reason: "INVENTORY",
      refund: true,
      restock: false,
      staffNote,
    });

    if (result.orderCancel.orderCancelUserErrors.length > 0) {
      throw new Error(
        result.orderCancel.orderCancelUserErrors
          .map((e) => `${e.code}: ${e.message}`)
          .join("; "),
      );
    }

    // orderCancel runs as a background job — refunding a real payment
    // provider can take longer than one request. Not polled to completion
    // here: the mutation was accepted without a user error, which is the
    // signal this call exists to report, and Shopify's own admin is the
    // place to watch the job through to done.
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Already cancelled — someone in the admin got there first, or an
    // earlier attempt actually succeeded and only the confirmation was
    // lost. The end state this call exists to reach is already true.
    if (/already.{0,20}cancel/i.test(message)) {
      return { ok: true };
    }

    return { ok: false, error: message };
  }
}

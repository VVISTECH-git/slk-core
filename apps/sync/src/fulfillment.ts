import type { ShopifyClient } from "./shopify-client";

export interface FulfillResult {
  ok: boolean;
  error?: string;
}

type FulfillmentOrderLine = {
  id: string;
  remainingQuantity: number;
  lineItem: { sku: string | null } | null;
};

/**
 * Tells Shopify's own order that a line item shipped — the half of packing
 * that never existed. `packReservation` wrote our ledger and pushed the new
 * stock count back to Shopify; it never told the *order* anything. Shopify's
 * own admin kept reading "Unfulfilled" forever, and a real customer never
 * got the shipping email Shopify sends the moment a fulfillment exists,
 * because nothing here ever created one.
 *
 * Matched by SKU, the same identifier `bookReservation` used to find the
 * consignment in the first place — the product code, on the label, on the
 * order. A quantity is spread across as many of the order's fulfillment
 * orders as it takes, because Shopify can split one order's line item
 * across more than one the moment part of it is fulfilled by hand, and a
 * reservation only knows the SKU and how many, not which fulfillment order
 * currently holds them.
 */
export async function fulfillReservationLine(
  client: ShopifyClient,
  { externalOrderId, sku, quantity }: { externalOrderId: string; sku: string; quantity: number },
): Promise<FulfillResult> {
  const orderId = externalOrderId.startsWith("gid://")
    ? externalOrderId
    : `gid://shopify/Order/${externalOrderId}`;

  try {
    const { order } = await client.graphql<{
      order: {
        fulfillmentOrders: {
          nodes: {
            id: string;
            status: string;
            lineItems: { nodes: FulfillmentOrderLine[] };
          }[];
        };
      } | null;
    }>(
      `query($id: ID!) {
        order(id: $id) {
          fulfillmentOrders(first: 10) {
            nodes {
              id
              status
              lineItems(first: 50) {
                nodes { id remainingQuantity lineItem { sku } }
              }
            }
          }
        }
      }`,
      { id: orderId },
    );

    // The order itself is gone — cancelled and removed, or a test order
    // cleared out of the admin. Nothing to fulfil is not a failure to
    // report; it is the same "already at the end state" shape as an
    // archived listing whose product no longer exists.
    if (order === null) return { ok: true };

    let remaining = quantity;
    const allocations: { fulfillmentOrderId: string; lineItemId: string; qty: number }[] = [];

    for (const fo of order.fulfillmentOrders.nodes) {
      if (fo.status !== "OPEN" && fo.status !== "IN_PROGRESS" && fo.status !== "SCHEDULED") {
        continue;
      }

      for (const line of fo.lineItems.nodes) {
        if (remaining <= 0) break;
        if (line.lineItem?.sku !== sku || line.remainingQuantity <= 0) continue;

        const take = Math.min(remaining, line.remainingQuantity);
        allocations.push({ fulfillmentOrderId: fo.id, lineItemId: line.id, qty: take });
        remaining -= take;
      }
    }

    // Already fulfilled — every matching line item has nothing left owing,
    // most likely because somebody fulfilled it by hand in the Shopify
    // admin before this ran. The order already says what packing was about
    // to tell it, so there is nothing left to do and nothing wrong.
    if (allocations.length === 0) return { ok: true };

    if (remaining > 0) {
      return {
        ok: false,
        error: `Packed ${quantity} but Shopify's order only had ${quantity - remaining} of SKU ${sku} still owing.`,
      };
    }

    const byOrder = new Map<string, { id: string; quantity: number }[]>();
    for (const a of allocations) {
      const list = byOrder.get(a.fulfillmentOrderId) ?? [];
      list.push({ id: a.lineItemId, quantity: a.qty });
      byOrder.set(a.fulfillmentOrderId, list);
    }

    const CREATE = `
      mutation Fulfil($fulfillment: FulfillmentInput!) {
        fulfillmentCreate(fulfillment: $fulfillment) {
          fulfillment { id }
          userErrors { field message }
        }
      }
    `;

    const result = await client.graphql<{
      fulfillmentCreate: {
        fulfillment: { id: string } | null;
        userErrors: { field: string[]; message: string }[];
      };
    }>(CREATE, {
      fulfillment: {
        // True, not omitted: the reason to write this at all is the email it
        // sends, so defaulting it away would ship the code and miss the point.
        notifyCustomer: true,
        lineItemsByFulfillmentOrder: [...byOrder.entries()].map(
          ([fulfillmentOrderId, fulfillmentOrderLineItems]) => ({
            fulfillmentOrderId,
            fulfillmentOrderLineItems,
          }),
        ),
      },
    });

    if (result.fulfillmentCreate.userErrors.length > 0) {
      throw new Error(
        result.fulfillmentCreate.userErrors
          .map((e) => `${e.field.join(".")}: ${e.message}`)
          .join("; "),
      );
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

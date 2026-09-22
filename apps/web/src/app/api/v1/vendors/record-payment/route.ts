import { recordVendorPayment } from "@/app/vendors/actions";
import { ApiError, body, guardedJobRole } from "@/lib/api";
import { claim, complete, keyFrom, release } from "@/lib/idempotency";

/**
 * Money paid against a vendor's running balance, not tied to any particular
 * transaction — wraps the same action the web Vendors drawer's "Record
 * payment" form calls. Idempotency-keyed: a payment has no natural key of
 * its own, so a retried POST from a phone on a bad connection was the one
 * money write that could land twice.
 */
export const POST = guardedJobRole(["Finance Manager"], async (request, actor) => {
  const key = keyFrom(request);
  const already = await claim(key, actor.id);
  if (already !== null) {
    return { message: "Already recorded — nothing recorded twice." };
  }

  const raw = await body(request);
  const vendorId = typeof raw.vendorId === "string" ? raw.vendorId : "";
  const amount = typeof raw.amount === "string" ? raw.amount : String(raw.amount ?? "");
  const paidOn = typeof raw.paidOn === "string" ? raw.paidOn : "";
  const method = typeof raw.method === "string" ? raw.method : "";
  const notes = typeof raw.notes === "string" ? raw.notes : "";

  if (vendorId === "") {
    await release(key);
    throw new ApiError("Pass vendorId.", 400);
  }

  let result: Awaited<ReturnType<typeof recordVendorPayment>>;
  try {
    result = await recordVendorPayment(vendorId, { amount, paidOn, method, notes });
  } catch (error) {
    await release(key);
    throw error;
  }

  if (!result.ok) {
    await release(key);
    throw new ApiError(result.message, 422);
  }

  await complete(key, vendorId);

  return { message: result.message };
});

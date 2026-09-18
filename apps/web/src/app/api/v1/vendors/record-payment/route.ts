import { recordVendorPayment } from "@/app/vendors/actions";
import { ApiError, body, guardedJobRole } from "@/lib/api";

/** Money paid against a vendor's running balance, not tied to any particular transaction — wraps the same action the web Vendors drawer's "Record payment" form calls. */
export const POST = guardedJobRole(["Finance Manager"], async (request) => {
  const raw = await body(request);
  const vendorId = typeof raw.vendorId === "string" ? raw.vendorId : "";
  const amount = typeof raw.amount === "string" ? raw.amount : String(raw.amount ?? "");
  const paidOn = typeof raw.paidOn === "string" ? raw.paidOn : "";
  const method = typeof raw.method === "string" ? raw.method : "";
  const notes = typeof raw.notes === "string" ? raw.notes : "";

  if (vendorId === "") throw new ApiError("Pass vendorId.", 400);

  const result = await recordVendorPayment(vendorId, { amount, paidOn, method, notes });
  if (!result.ok) throw new ApiError(result.message, 422);

  return { message: result.message };
});

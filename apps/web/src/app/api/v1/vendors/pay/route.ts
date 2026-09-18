import { payVendorTransactions } from "@/app/vendors/actions";
import { ApiError, body, guardedJobRole } from "@/lib/api";

/** Settles a set of approved, unpaid transactions for one vendor in a single payment — wraps the same action the web Vendor Ledger's Pay drawer calls. */
export const POST = guardedJobRole(["Finance Manager"], async (request) => {
  const raw = await body(request);
  const vendorId = typeof raw.vendorId === "string" ? raw.vendorId : "";
  const transactionIds = Array.isArray(raw.transactionIds) ? raw.transactionIds.map(String) : [];
  const paidOn = typeof raw.paidOn === "string" ? raw.paidOn : "";
  const method = typeof raw.method === "string" ? raw.method : "";
  const notes = typeof raw.notes === "string" ? raw.notes : "";

  if (vendorId === "") throw new ApiError("Pass vendorId.", 400);

  const result = await payVendorTransactions(vendorId, transactionIds, { paidOn, method, notes });
  if (!result.ok) throw new ApiError(result.message, 422);

  return { message: result.message };
});

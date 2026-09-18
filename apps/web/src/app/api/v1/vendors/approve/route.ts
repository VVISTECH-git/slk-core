import { approveVendorTransactions } from "@/app/vendors/actions";
import { ApiError, body, guardedJobRole } from "@/lib/api";

/** Finance's sign-off on a set of transactions, before any of them can be paid — wraps the same action the web Vendor Ledger's Approve button calls. */
export const POST = guardedJobRole(["Finance Manager"], async (request) => {
  const raw = await body(request);
  const transactionIds = Array.isArray(raw.transactionIds) ? raw.transactionIds.map(String) : [];

  const result = await approveVendorTransactions(transactionIds);
  if (!result.ok) throw new ApiError(result.message, 422);

  return { message: result.message };
});

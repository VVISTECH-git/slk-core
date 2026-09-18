import { priceVendorTransactions } from "@/app/vendors/actions";
import { ApiError, body, guardedJobRole } from "@/lib/api";

/** Prices a set of previously-unpriced transactions at one rate per piece — wraps the same action the web Vendor Ledger's Price drawer calls. */
export const POST = guardedJobRole(["Finance Manager"], async (request) => {
  const raw = await body(request);
  const transactionIds = Array.isArray(raw.transactionIds) ? raw.transactionIds.map(String) : [];
  const unitPrice = typeof raw.unitPrice === "number" ? raw.unitPrice : Number(raw.unitPrice);

  const result = await priceVendorTransactions(transactionIds, unitPrice);
  if (!result.ok) throw new ApiError(result.message, 422);

  return { message: result.message };
});

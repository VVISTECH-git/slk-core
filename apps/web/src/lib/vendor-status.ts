/**
 * Pure, no `db` import — safe for a "use client" component to pull in
 * directly. `lib/vendors.ts` re-exports this for server-side callers, but
 * a client component should import it from here: importing anything but a
 * `type` from `lib/vendors.ts` drags its `db` import (real Postgres
 * connection code) into the browser bundle.
 */

/**
 * The states a transaction moves through before it's settled. "needs_pricing"
 * comes before "unapproved" — a transaction created for a vendor with no
 * rate set at receive time (see `receiveBatch`) has no amount yet, and
 * approving or paying an unknown amount makes no sense, so it's checked
 * first and blocks both until Finance fills it in.
 */
export type VendorTransactionStatus = "needs_pricing" | "unapproved" | "approved" | "paid";

export function vendorTransactionStatus(e: {
  amount: number | null;
  approvedAt: string | null;
  paidAt: string | null;
}): VendorTransactionStatus {
  if (e.amount === null) return "needs_pricing";
  if (e.paidAt !== null) return "paid";
  if (e.approvedAt !== null) return "approved";
  return "unapproved";
}

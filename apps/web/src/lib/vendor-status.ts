/**
 * Pure, no `db` import — safe for a "use client" component to pull in
 * directly. `lib/vendors.ts` re-exports this for server-side callers, but
 * a client component should import it from here: importing anything but a
 * `type` from `lib/vendors.ts` drags its `db` import (real Postgres
 * connection code) into the browser bundle.
 */

/** The three states a transaction moves through before it's settled. */
export type VendorTransactionStatus = "unapproved" | "approved" | "paid";

export function vendorTransactionStatus(e: { approvedAt: string | null; paidAt: string | null }): VendorTransactionStatus {
  if (e.paidAt !== null) return "paid";
  if (e.approvedAt !== null) return "approved";
  return "unapproved";
}

import { guardedJobRole } from "@/lib/api";
import { loadVendors } from "@/lib/vendors";

/**
 * Every vendor with what's owed and what's been paid — mobile Finance
 * Manager's own vendor list, the same rows the web Vendors page shows.
 * A different path from `/vendors` (not the same route with a richer
 * response): that one is gated to Bale Custodian/Handler for the Send
 * picker and deliberately carries none of this vendor's money, which a
 * floor phone sending a batch has no reason to read.
 *
 * The role list is a literal here, not imported from vendors/actions.ts's
 * own `FINANCE_JOB_ROLES` — that file is `"use server"`, which only allows
 * async function exports across a module boundary; importing its plain
 * array into a route handler fails the production build outright ("A
 * 'use server' file can only export async functions, found object"), even
 * though the same import works from a page or client component. Must still
 * match `FINANCE_JOB_ROLES` by hand.
 */
export const GET = guardedJobRole(["Finance Manager"], () => loadVendors());

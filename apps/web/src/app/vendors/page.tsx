import { requirePage } from "@/lib/session";
import { loadVendors } from "@/lib/vendors";

import { Vendors } from "./vendors";

export const dynamic = "force-dynamic";

/**
 * Who does a stage of processing, ahead of the pipeline that will use this
 * list — see `packages/db/src/schema/production.ts`.
 */
export default async function VendorsPage() {
  await requirePage();

  return <Vendors rows={await loadVendors()} />;
}

import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

/**
 * Who does a stage of processing — cutting, salava, karakkaya, printing,
 * ironing. Its own file rather than `lib/bales.ts`: nothing in `bale` points
 * at a vendor yet, so this isn't bale data — it's the list kept ready ahead
 * of the handover work that will use it.
 */
export type VendorRow = {
  id: string;
  name: string;
  phone: string | null;
  village: string | null;
  stages: string[];
  notes: string | null;
};

export async function loadVendors(): Promise<VendorRow[]> {
  return db.execute<VendorRow>(sql`
    select id, name, phone, village, stages, notes from vendor order by name
  `);
}

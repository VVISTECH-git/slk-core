import { requirePage } from "@/lib/session";
import { loadStorageUsage } from "@/lib/storage-usage";

import { StorageUsageView } from "./storage-view";

export const dynamic = "force-dynamic";

export default async function StoragePage() {
  // Office and up. Not floor territory — nobody photographing a saree needs
  // to know what the bucket costs — but not owner-only either, the way Staff
  // and Channels are: nothing here is money moving or who can sign in, it is
  // a diagnostic anyone running Master Lists would reasonably want.
  await requirePage("office");

  return <StorageUsageView usage={await loadStorageUsage()} />;
}

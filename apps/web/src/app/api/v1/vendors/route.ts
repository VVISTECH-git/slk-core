import { guarded } from "@/lib/api";
import { loadVendorSummaries } from "@/lib/vendors";

/** Who a batch can be sent to — id, name and which stages they do. Same list the web Send screen's vendor picker reads. */
export const GET = guarded("floor", () => loadVendorSummaries());

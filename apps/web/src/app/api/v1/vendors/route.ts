import { guardedJobRole } from "@/lib/api";
import { loadVendorSummaries } from "@/lib/vendors";

/**
 * Who a batch can be sent to — id, name and which stages they do. Same list
 * the web Send screen's vendor picker reads. Gated the same as Handovers
 * itself (see handovers/page.tsx's own HANDOVER_JOB_ROLES) — the vendor
 * picker is inside that screen, not a separate privilege.
 */
export const GET = guardedJobRole(["Bale Custodian", "Handler"], () => loadVendorSummaries());

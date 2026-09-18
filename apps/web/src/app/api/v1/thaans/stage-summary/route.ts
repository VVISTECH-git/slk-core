import { guardedJobRole } from "@/lib/api";
import { loadStageSummary } from "@/lib/thaans";

/**
 * How many Thaans currently sit at each point in the pipeline —
 * Production Manager and Operations Manager's own landing view. Mobile's
 * REST equivalent of the numbers already baked into the web Dashboard's
 * "Thaans by current stage" chart.
 */
export const GET = guardedJobRole(["Production Manager", "Operations Manager"], () => loadStageSummary());

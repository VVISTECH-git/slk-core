import { guardedJobRole } from "@/lib/api";
import { loadTypeSummary } from "@/lib/thaans";

/**
 * Every bale type's own completion — Production Manager and Operations
 * Manager's own reorder signal: a type that's mostly Finished with nothing
 * left behind it is a type about to run out of stock to cut, not just a
 * type doing well. Tap into one from here for its own full stage
 * breakdown (`GET /thaans/stage-summary?type=`).
 */
export const GET = guardedJobRole(["Production Manager", "Operations Manager"], () => loadTypeSummary());

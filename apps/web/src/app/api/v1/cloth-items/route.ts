import { guardedJobRole } from "@/lib/api";
import { loadClothItems } from "@/lib/bales";

/**
 * What a bale can be logged as containing — Bale Intake's Item field, gated
 * the same as the rest of Bale Intake (see suppliers/route.ts's own note).
 */
export const GET = guardedJobRole(["Bale Custodian"], () => loadClothItems());

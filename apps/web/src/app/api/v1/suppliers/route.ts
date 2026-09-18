import { guardedJobRole } from "@/lib/api";
import { loadSuppliers } from "@/lib/bales";

/**
 * Who Bale Intake can name as the source of a bale — gated the same as Bale
 * Intake itself (see bales/page.tsx's BALE_JOB_ROLES), since a Bale
 * Custodian who can reach the form but not this dropdown is a form that
 * doesn't work.
 */
export const GET = guardedJobRole(["Bale Custodian"], () => loadSuppliers());

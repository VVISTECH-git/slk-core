import { guarded } from "@/lib/api";
import { loadSuppliers } from "@/lib/bales";

/** Who Bale Intake can name as the source of a bale. */
export const GET = guarded("floor", () => loadSuppliers());

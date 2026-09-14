import { guarded } from "@/lib/api";
import { loadClothItems } from "@/lib/bales";

/** What a bale can be logged as containing — Bale Intake's Item field. */
export const GET = guarded("floor", () => loadClothItems());

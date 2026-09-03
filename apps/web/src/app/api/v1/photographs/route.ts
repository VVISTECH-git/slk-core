import { guarded } from "@/lib/api";
import { loadShotList } from "@/lib/shot-list";

/**
 * Everything still waiting to be photographed.
 *
 * The one screen on the phone with no counterpart in the portal. There,
 * uploading happens inside a record you already have open; here the question
 * runs the other way — somebody has a camera and wants to know which sarees to
 * fetch — and that only makes sense as a list across the catalogue.
 *
 * `floor`, like the upload it leads to.
 */
export const GET = guarded("floor", () => loadShotList());

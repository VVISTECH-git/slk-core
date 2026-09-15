/**
 * The stage names from the spreadsheet's own "Persons" sheet, in pipeline
 * order — each the name of the process itself ("Salava", not "Kora to
 * Salava"; the cloth arrives at Salava, it doesn't travel "to" it as a
 * named step). Order matters here — it's what "sequential" means for a
 * Thaan moving through Handovers: it must finish stage N before stage N+1
 * can start. See `packages/db/src/schema/production.ts`.
 *
 * "Label Stitching" comes first: the QR code label is stitched onto the
 * Thaan by the Master as soon as it's cut and coded, before any of the
 * other processing stages begin.
 */
export const STAGES = [
  "Label Stitching",
  "Salava",
  "Karakkaya",
  "Print",
  "Second Print",
  "Nellateeta",
  "Udukulu",
  "Ironing",
] as const;

export type Stage = (typeof STAGES)[number];

/**
 * The stage order a specific Thaan actually follows. Second Print isn't
 * needed for every bale — set at intake (`bale.needs_second_print`) — so a
 * Thaan whose bale doesn't need it skips straight from Print to Nellateeta.
 * Every consumer of "what comes after stage N" reads this, not `STAGES`
 * directly, so the skip can't drift out of sync between them.
 */
export function stagesFor(needsSecondPrint: boolean): readonly Stage[] {
  return needsSecondPrint ? STAGES : STAGES.filter((s) => s !== "Second Print");
}

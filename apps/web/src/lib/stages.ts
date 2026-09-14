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

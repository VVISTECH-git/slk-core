/**
 * The stage names from the spreadsheet's own "Persons" sheet, in pipeline
 * order. Order matters here — it's what "sequential" means for a Thaan
 * moving through Handovers: it must finish stage N before stage N+1 can
 * start. See `packages/db/src/schema/production.ts`.
 */
export const STAGES = [
  "Kora to Salava",
  "Salava to Karakkaya",
  "Karakkaya to Print",
  "Second Print",
  "Print to Nellateeta",
  "Neelateeta to Udukulu",
  "Ironing",
] as const;

export type Stage = (typeof STAGES)[number];

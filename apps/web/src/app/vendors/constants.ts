/**
 * The stage names from the spreadsheet's own "Persons" sheet, in pipeline
 * order. Informational only — nothing enforces or reads this against the
 * `bale` table yet, since the handover pipeline doesn't exist. See
 * `packages/db/src/schema/production.ts`.
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

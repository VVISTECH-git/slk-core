-- Each stage is the name of a single process a Thaan goes through — Salava,
-- Karakkaya, Print, Second Print, Nellateeta, Udukulu, Ironing — not a
-- "from → to" transition between two of them. "Kora to Salava" read as
-- though Kora were a stage in its own right; it isn't one, it's the raw
-- cloth a bale arrives as, before any of these seven starts. Corrected
-- before any real handover ever existed to carry the old names — this
-- table has had no UI to write through until Handovers, today.

ALTER TABLE "handover" DROP CONSTRAINT "handover_stage_known";--> statement-breakpoint

ALTER TABLE "handover" ADD CONSTRAINT "handover_stage_known" CHECK ("handover"."stage" in (
  'Salava', 'Karakkaya', 'Print', 'Second Print', 'Nellateeta', 'Udukulu', 'Ironing'
));

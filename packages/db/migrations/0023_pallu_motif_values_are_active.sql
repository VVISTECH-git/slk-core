-- Pallu Motif's values were never confirmed.
--
-- All five arrived from the workbook as Proposed — the Correction Log's
-- suggestion, awaiting somebody's yes — and a proposed value is not offered
-- on a record. So the field asked for on Additional Product Details rendered
-- as nothing at all, which reads as a bug rather than as a question nobody
-- has answered.
--
-- Asking for the field is the yes. Plain Pallu, Zari Pallu, Contrast Pallu,
-- Woven Motif Pallu and Same as Border are unremarkable descriptions of how a
-- pallu is finished, and none of them is a guess about SLK's vocabulary.
--
-- Reversible from the screen: set any of them back to Proposed on Master
-- Lists and it stops being offered, with no migration.

UPDATE "lookup_value"
SET "status" = 'active', "updated_at" = now()
WHERE "list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'pallu_design')
  AND "status" = 'proposed';

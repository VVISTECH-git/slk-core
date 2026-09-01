-- Some lists are a scale, not a set of names.
--
-- Dropdowns read alphabetically now, which is right for twenty-seven motifs
-- and a hundred and forty-seven colours: they are found by scanning for a
-- word. It is wrong for Border Height, whose four values are a measurement —
-- "3-5 Inch, 5-8 Inch, Above 8 Inch, Up to 3 Inch" is the same four widths
-- shuffled, and the reader has to reassemble the ladder every time.
--
-- Which of the two a list is, is a fact about the list, so it is stored on
-- the list rather than decided by a condition naming Border Height in the
-- query. Any list can be marked, and the order it then keeps is the sort
-- order already on its values.

ALTER TABLE "lookup_list" ADD COLUMN IF NOT EXISTS "is_ordered" boolean
  NOT NULL DEFAULT false;--> statement-breakpoint

COMMENT ON COLUMN "lookup_list"."is_ordered" IS
  'The values have a meaningful order of their own — a scale, a sequence — so they are offered in sort order rather than alphabetically.';--> statement-breakpoint

UPDATE "lookup_list"
SET "is_ordered" = true, "updated_at" = now()
WHERE "code" = 'border_height';--> statement-breakpoint

-- The workbook's order is the ladder, narrowest first. Restated here because
-- it is now load-bearing rather than incidental.
UPDATE "lookup_value" v
SET "sort_order" = w."n", "updated_at" = now()
FROM (VALUES
  ('Up to 3 Inch', 0),
  ('3-5 Inch',     1),
  ('5-8 Inch',     2),
  ('Above 8 Inch', 3)
) AS w("label", "n")
WHERE v."list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'border_height')
  AND v."label" = w."label";

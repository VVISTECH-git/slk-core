-- Border Height as SLK actually names it.
--
-- The workbook's four were widths and nothing else — Up to 3 Inch, 3-5 Inch,
-- 5-8 Inch, Above 8 Inch. On the live screen they were replaced by the three
-- names a weaver uses, each carrying its width: Khadi, Nizam, Kanchi.
--
-- The repo kept the workbook's, so the two databases disagreed about what
-- the field even offers. This is the second time an edit made on the screen
-- has quietly split them, so it is written down here rather than left to
-- whichever database somebody happens to be looking at.
--
-- The old four are retired rather than deleted: any design already carrying
-- one keeps reading, which is the whole reason retiring exists.

INSERT INTO "lookup_value" ("list_id", "code", "label", "sort_order", "status")
SELECT
  (SELECT "id" FROM "lookup_list" WHERE "code" = 'border_height'),
  v."code", v."label", v."sort_order", 'active'
FROM (VALUES
  ('khadi_2_3_inch',  'Khadi (2-3 Inch)',  0),
  ('nizam_4_5_inch',  'Nizam (4-5 Inch)',  1),
  ('kanchi_6_8_inch', 'Kanchi (6-8 Inch)', 2)
) AS v("code", "label", "sort_order")
WHERE NOT EXISTS (
  SELECT 1 FROM "lookup_value" e
  WHERE e."list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'border_height')
    AND lower(e."label") = lower(v."label")
)
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- Whatever the three are called, they are a ladder and the list already says
-- it keeps its own order. Restated so the order is narrowest first wherever
-- this runs.
UPDATE "lookup_value" v
SET "sort_order" = w."n", "updated_at" = now()
FROM (VALUES
  ('Khadi (2-3 Inch)',  0),
  ('Nizam (4-5 Inch)',  1),
  ('Kanchi (6-8 Inch)', 2)
) AS w("label", "n")
WHERE v."list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'border_height')
  AND v."label" = w."label";--> statement-breakpoint

UPDATE "lookup_value"
SET "status" = 'retired', "updated_at" = now()
WHERE "list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'border_height')
  AND "label" IN ('Up to 3 Inch', '3-5 Inch', '5-8 Inch', 'Above 8 Inch');

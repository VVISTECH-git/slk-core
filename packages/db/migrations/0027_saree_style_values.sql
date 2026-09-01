-- Saree Style, filled in where it arrived empty.
--
-- 0021 created the list by moving the five layouts out of Product Sub Type,
-- which worked where those five were still sitting there and did nothing
-- where they were not. On the live database they had already been edited by
-- hand, so the move found nothing, the list was created empty, and the field
-- did not render at all — a question with no possible answer is not asked,
-- which is right in general and unhelpful here.
--
-- So: state the values rather than derive them. Inserted only where missing,
-- so this is safe on a database where the move did work and safe to run
-- twice.

INSERT INTO "lookup_value" ("list_id", "code", "label", "sort_order", "status")
SELECT
  (SELECT "id" FROM "lookup_list" WHERE "code" = 'saree_style'),
  v."code", v."label", v."sort_order", 'active'
FROM (VALUES
  ('all_over',        'All Over',          0),
  ('half_and_half',   'Half and Half',     1),
  ('plain_no_design', 'Plain (No Design)', 2),
  ('scattered_buta',  'Scattered Buta',    3),
  ('langa_voni',      'Langa Voni',        4)
) AS v("code", "label", "sort_order")
WHERE EXISTS (SELECT 1 FROM "lookup_list" WHERE "code" = 'saree_style')
  AND NOT EXISTS (
    SELECT 1 FROM "lookup_value" e
    WHERE e."list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'saree_style')
      AND lower(e."label") = lower(v."label")
  )
ON CONFLICT DO NOTHING;

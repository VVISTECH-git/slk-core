-- Saree Style, Blouse Style, and Product Sub Type meaning what it says.
--
-- Product Sub Type was carrying the saree's layout — All Over, Half and Half,
-- Langa Voni — because that was the only field narrowed by product type and
-- the layout had to go somewhere. It is not a sub type of anything; it is how
-- the design sits on the cloth. So:
--
--   Saree Style        gets those five, moved rather than copied
--   Blouse Style       Self, Contrast
--   Product Sub Type   With Blouse, Without Blouse — a saree's only real
--                      sub-kinds, and still offered only under Saree
--
-- Moved rather than copied so that any design already pointing at one of the
-- five keeps pointing at the same row; the value did not change, the question
-- it answers did. `design.garment_type_id` is then cleared for those, because
-- a layout is not a sub type and leaving it there would have the record
-- claiming a value the list no longer offers.

INSERT INTO "lookup_list" ("code", "label", "description", "is_enabled", "status")
VALUES
  ('saree_style', 'Saree Style',
   'How the design sits on the cloth — All Over, Half and Half, Langa Voni. Asked only on a saree.',
   true, 'active'),
  ('blouse_style', 'Blouse Style',
   'Whether the blouse piece matches the saree or is deliberately unlike it.',
   true, 'active')
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint

-- 1 · The five layouts move to Saree Style and stop naming a parent. The tab
--     they appear on is already saree-only, so the narrowing is the tab's job
--     rather than the value's.
UPDATE "lookup_value" v
SET "list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'saree_style'),
    "parent_value_id" = NULL,
    "updated_at" = now()
WHERE v."list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'garment_type')
  AND v."parent_value_id" = (
    SELECT "id" FROM "lookup_value"
    WHERE "list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'product_type')
      AND "label" = 'Saree'
  );--> statement-breakpoint

ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "saree_style_id" uuid
  REFERENCES "lookup_value"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "blouse_style_id" uuid
  REFERENCES "lookup_value"("id") ON DELETE RESTRICT;--> statement-breakpoint

-- 2 · A record that named one of the five was naming its style all along.
UPDATE "design" d
SET "saree_style_id" = d."garment_type_id",
    "garment_type_id" = NULL,
    "updated_at" = now()
FROM "lookup_value" v
WHERE v."id" = d."garment_type_id"
  AND v."list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'saree_style');--> statement-breakpoint

-- 3 · Blouse Style.
INSERT INTO "lookup_value" ("list_id", "code", "label", "sort_order", "status")
SELECT
  (SELECT "id" FROM "lookup_list" WHERE "code" = 'blouse_style'),
  v."code", v."label", v."sort_order", 'active'
FROM (VALUES ('self', 'Self', 0), ('contrast', 'Contrast', 1))
  AS v("code", "label", "sort_order")
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- 4 · What a saree's sub type actually is.
INSERT INTO "lookup_value" ("list_id", "code", "label", "sort_order", "parent_value_id", "status")
SELECT
  (SELECT "id" FROM "lookup_list" WHERE "code" = 'garment_type'),
  v."code", v."label", v."sort_order",
  (SELECT "id" FROM "lookup_value"
   WHERE "list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'product_type')
     AND "label" = 'Saree'),
  'active'
FROM (VALUES
  ('with_blouse',    'With Blouse',    101),
  ('without_blouse', 'Without Blouse', 102)
) AS v("code", "label", "sort_order")
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- 5 · Saree Layout asked exactly what Saree Style now asks, on the same tab.
--     Two identical dropdowns side by side is not a choice anyone should be
--     offered. Switched off rather than deleted: records carrying a layout
--     keep it, and one click on Master Lists brings it back.
UPDATE "lookup_list"
SET "is_enabled" = false,
    "status" = 'retired',
    "description" = 'Replaced by Saree Style, which holds the same values and one more. Kept because records still carry these.',
    "updated_at" = now()
WHERE "code" = 'saree_layout';--> statement-breakpoint

UPDATE "lookup_value"
SET "status" = 'retired', "updated_at" = now()
WHERE "list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'saree_layout');

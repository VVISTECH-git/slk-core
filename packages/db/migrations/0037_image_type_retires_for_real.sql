-- 0036 retired Image Type and nothing happened. So did 0031, which set a
-- description on it that has never been visible on the live screen.
--
-- Both matched on `code = 'image_type'`, and that code does not exist. Image
-- Type was created on Master Lists rather than seeded, and `slugify` turns a
-- label into hyphens — 'image-type' — while every seeded list was hand-written
-- with underscores, 'image_slot' among them. Two conventions in one column,
-- and a WHERE clause that looked right against the seed file.
--
-- Matched on the label here, which is what a person reading the screen would
-- match on and what no naming convention can move out from under us. Narrowed
-- so it can only ever hit the intended list: never the one the record editor
-- reads by code, and never one a photograph actually hangs off.

UPDATE "lookup_value"
SET "status" = 'retired', "updated_at" = now()
WHERE "status" <> 'retired'
  AND "list_id" IN (
    SELECT l."id" FROM "lookup_list" l
    WHERE lower(l."label") = 'image type'
      AND l."code" <> 'image_slot'
      AND NOT EXISTS (
        SELECT 1 FROM "image" i
        JOIN "lookup_value" v ON v."id" = i."slot_id"
        WHERE v."list_id" = l."id"
      )
  );--> statement-breakpoint

UPDATE "lookup_list" l
SET "is_enabled" = false,
    "status" = 'retired',
    "description" = 'Retired in favour of Image Slot, which is the list the record editor reads and the one image rows point at. Kept so the choice can be reversed.',
    "updated_at" = now()
WHERE lower(l."label") = 'image type'
  AND l."code" <> 'image_slot'
  AND NOT EXISTS (
    SELECT 1 FROM "image" i
    JOIN "lookup_value" v ON v."id" = i."slot_id"
    WHERE v."list_id" = l."id"
  );

-- Three questions become one: Textile Material.
--
-- Cotton Sub Family, Silk Sub Family and Fabric Type were three lists asking
-- the same thing — what the cloth is — split by which fibre it happened to be.
-- Two of them could never both apply, and the third sat beside them asking the
-- same question again in different words.
--
-- One classification now holds all thirteen, and it depends on Fiber Type so
-- the answer is still narrowed to what the fibre allows:
--
--   Mul Mul, Khadi, Mercerized              belong to Cotton
--   Pattu, Katan, Kora, Tussar, Dola, Geecha belong to Silk
--   Georgette, Chiffon, Crepe, Tissue        belong to no fibre in particular
--
-- The last four name a weave or a finish rather than a fibre — a georgette can
-- be silk or viscose — so they are left unparented and the form offers them
-- whatever the fibre is. That rule lives in the editor, next to the filter it
-- changes.
--
-- The values are written afresh rather than moved between lists. The one
-- design already carrying a Cotton Sub Family keeps pointing at the value it
-- chose, which is the whole reason retiring exists rather than deleting.

INSERT INTO "lookup_list" ("code", "label", "description", "parent_list_id", "is_enabled", "status")
SELECT
  'textile_material',
  'Textile Material',
  'What the cloth is. Narrowed by Fiber Type — a silk names its silk, a cotton names its cotton, and the weaves that any fibre can take are always offered.',
  (SELECT "id" FROM "lookup_list" WHERE "code" = 'fibre_type'),
  true,
  'active'
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint

INSERT INTO "lookup_value" ("list_id", "code", "label", "sort_order", "parent_value_id", "status")
SELECT
  (SELECT "id" FROM "lookup_list" WHERE "code" = 'textile_material'),
  v."code",
  v."label",
  v."sort_order",
  (SELECT "id" FROM "lookup_value"
   WHERE "list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'fibre_type')
     AND "label" = v."fibre"),
  'active'
FROM (VALUES
  ('mul_mul',    'Mul Mul',    10, 'Cotton'),
  ('khadi',      'Khadi',      11, 'Cotton'),
  ('mercerized', 'Mercerized', 12, 'Cotton'),
  ('pattu',      'Pattu',      20, 'Silk'),
  ('katan',      'Katan',      21, 'Silk'),
  ('kora',       'Kora',       22, 'Silk'),
  ('tussar',     'Tussar',     23, 'Silk'),
  ('dola',       'Dola',       24, 'Silk'),
  ('geecha',     'Geecha',     25, 'Silk'),
  ('georgette',  'Georgette',  30, NULL),
  ('chiffon',    'Chiffon',    31, NULL),
  ('crepe',      'Crepe',      32, NULL),
  ('tissue',     'Tissue',     33, NULL)
) AS v("code", "label", "sort_order", "fibre")
ON CONFLICT DO NOTHING;--> statement-breakpoint

ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "textile_material_id" uuid
  REFERENCES "lookup_value"("id") ON DELETE RESTRICT;--> statement-breakpoint

-- The three they replace stop being asked. Switching the classification off is
-- what removes the field — loadOptions only sends values from enabled lists —
-- and retiring the values makes the same statement one row at a time, so
-- neither Master Lists nor the record editor offers them again.
UPDATE "lookup_list"
SET "is_enabled" = false,
    "status" = 'retired',
    "description" = 'Replaced by Textile Material, which asks this once for every fibre. Kept because records still carry these values.',
    "updated_at" = now()
WHERE "code" IN ('cotton_sub_family', 'silk_sub_family', 'fabric_type');--> statement-breakpoint

UPDATE "lookup_value"
SET "status" = 'retired',
    "updated_at" = now()
WHERE "list_id" IN (
  SELECT "id" FROM "lookup_list"
  WHERE "code" IN ('cotton_sub_family', 'silk_sub_family', 'fabric_type')
);

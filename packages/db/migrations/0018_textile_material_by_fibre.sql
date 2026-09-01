-- Textile Material, once, narrowed by fibre.
--
-- Two classifications were both called Textile Material: `regional_style`,
-- relabelled on the live screen, holding the twenty-three weaves — Banarasi,
-- Kanchipuram, Gadwal; and `textile_material`, holding thirteen. Two entries
-- with one name in every picker, and a rename is not a merge.
--
-- They become one. `textile_material` is the survivor because it is the code
-- the record editor reads and the column the design carries, and the
-- twenty-three move into it rather than being copied, so every record already
-- pointing at one keeps pointing at the same row.
--
-- What is offered follows the fibre:
--
--   Silk    the twenty-three named weaves
--   Cotton  Mul Mul, Khadi, Mercerized
--   other   Georgette, Chiffon, Crepe, Tissue, Pattu, Katan, Kora, Tussar,
--           Dola, Geecha
--
-- The last group is the one with no fibre named. Pattu and Katan move into it
-- from Silk, which is where they were: they are not among the weaves a silk
-- is offered now, and they still have to be offered to something.

-- 1 · The twenty-three move across, parented to Silk, ordered after the rest.
UPDATE "lookup_value" v
SET "list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'textile_material'),
    "parent_value_id" = (
      SELECT "id" FROM "lookup_value"
      WHERE "list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'fibre_type')
        AND "label" = 'Silk'
    ),
    "sort_order" = 100 + v."sort_order",
    "updated_at" = now()
WHERE v."list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'regional_style');--> statement-breakpoint

-- 2 · The six silks join the group that names no fibre.
UPDATE "lookup_value"
SET "parent_value_id" = NULL,
    "updated_at" = now()
WHERE "list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'textile_material')
  AND "label" IN ('Pattu', 'Katan', 'Kora', 'Tussar', 'Dola', 'Geecha');--> statement-breakpoint

-- 3 · A record that named a region style has named a textile material all
--     along. The value did not move house; the question it answers did.
UPDATE "design"
SET "textile_material_id" = "regional_style_id"
WHERE "textile_material_id" IS NULL
  AND "regional_style_id" IS NOT NULL;--> statement-breakpoint

-- 4 · The emptied classification stops being asked. Its column stays on the
--     design, holding what it always held.
UPDATE "lookup_list"
SET "is_enabled" = false,
    "status" = 'retired',
    "label" = 'Region Style',
    "description" = 'Folded into Textile Material, which asks this once for every fibre. Kept because records still carry these values.',
    "updated_at" = now()
WHERE "code" = 'regional_style';--> statement-breakpoint

UPDATE "lookup_list"
SET "description" = 'What the cloth is. Narrowed by Fiber Type — a silk names its weave, a cotton names its cotton, and everything else shares the rest.',
    "updated_at" = now()
WHERE "code" = 'textile_material';--> statement-breakpoint

-- 5 · What a new record starts with.
--
-- Data rather than code: almost every piece SLK makes is a plain-weave
-- Kalamkari saree, and changing that should be a click on Operational
-- Standard. One default per list is enforced by a partial unique index, so
-- whatever held it is cleared in the same statement pair.
UPDATE "lookup_value" v
SET "is_default" = false, "updated_at" = now()
FROM "lookup_list" l
WHERE l."id" = v."list_id"
  AND l."code" IN ('product_type', 'weave_structure', 'craft_technique')
  AND v."is_default";--> statement-breakpoint

UPDATE "lookup_value" v
SET "is_default" = true, "updated_at" = now()
FROM "lookup_list" l
WHERE l."id" = v."list_id"
  AND v."status" = 'active'
  AND (l."code", v."label") IN (
    ('product_type',    'Saree'),
    ('weave_structure', 'Plain Weave'),
    ('craft_technique', 'Kalamkari')
  );

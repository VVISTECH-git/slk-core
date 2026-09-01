-- Product Sub Type, for a saree.
--
-- The field already exists and already knows how to narrow itself: a Product
-- Sub Type value names the Product Type it belongs under, and the form offers
-- only the ones whose parent is the chosen type. Nothing was parented to
-- Saree, so a saree showed no sub type at all.
--
-- These five are what a saree's sub type is: how the design is laid out over
-- the cloth. Four of them already exist as Saree Layout, which asked the same
-- question one tab further along; they are written again here rather than
-- moved, so that any record already carrying a Saree Layout keeps pointing at
-- the value it chose. Saree Layout is left switched on — turning it off is a
-- click on Operational Standard, and that is a call about the data.

INSERT INTO "lookup_value" ("list_id", "code", "label", "sort_order", "parent_value_id", "status")
SELECT
  l."id",
  v."code",
  v."label",
  v."sort_order",
  (SELECT "id" FROM "lookup_value"
   WHERE "list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'product_type')
     AND "label" = 'Saree'),
  'active'
FROM "lookup_list" l
CROSS JOIN (VALUES
  ('all_over',          'All Over',          101),
  ('half_and_half',     'Half and Half',     102),
  ('plain_no_design',   'Plain (No Design)', 103),
  ('scattered_buta',    'Scattered Buta',    104),
  ('langa_voni',        'Langa Voni',        105)
) AS v("code", "label", "sort_order")
WHERE l."code" = 'garment_type'
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- Said where the list is described, because "Product Sub Type" now covers two
-- unlike things — garment kinds and saree layouts — and which you are offered
-- depends entirely on the product type above it.
UPDATE "lookup_list"
SET "description" = 'What kind of thing this is within its product type. A saree''s layout; a garment''s cut. Each value names the product type it belongs under, and only those are offered.',
    "updated_at" = now()
WHERE "code" = 'garment_type';

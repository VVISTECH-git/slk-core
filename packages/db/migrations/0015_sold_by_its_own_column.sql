-- Stop making one column mean two things.
--
-- `parent_value_id` was doing two unrelated jobs:
--
--   Motif        -> Motif Category    "is a kind of"
--   Product Type -> Piece / Metre     "is measured in"
--
-- Both are real, neither is the other, and a value has only one parent slot —
-- so a Product Sub Type could say it is sold by the Piece or say which
-- Product Type it belongs under, but not both. It was already saying the
-- first, which is why Operational Standard showed Product Sub Type depending
-- on Sold By, and why the rule that hides the field on a saree was working
-- for the wrong reason.
--
-- Unit of measure gets its own column. A real foreign key rather than a value
-- in `meta`, because this is a reference: deleting Metre while a product type
-- claims it should be refused, not silently dangle.

ALTER TABLE "lookup_value" ADD COLUMN "sold_by_id" uuid
  REFERENCES "lookup_value"("id") ON DELETE RESTRICT;--> statement-breakpoint

-- Move the UOM pointers across, then vacate the parent slot they were
-- occupying. Identified by where they point rather than by which list they
-- are in, so nothing is missed and nothing else is touched.
UPDATE "lookup_value" v
SET "sold_by_id" = v."parent_value_id",
    "parent_value_id" = NULL,
    "updated_at" = now()
FROM "lookup_value" p
WHERE p."id" = v."parent_value_id"
  AND p."list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'uom');--> statement-breakpoint

CREATE INDEX "lookup_value_sold_by_idx" ON "lookup_value" ("sold_by_id");--> statement-breakpoint

-- The list-level dependencies were derived from those same pointers in 0014,
-- so they inherited the confusion. Rebuild them from what is left, which is
-- now only taxonomy parenthood.
UPDATE "lookup_list" SET "parent_list_id" = NULL;--> statement-breakpoint

UPDATE "lookup_list" child
SET "parent_list_id" = link.parent_list
FROM (
  SELECT DISTINCT v."list_id" AS child_list, p."list_id" AS parent_list
  FROM "lookup_value" v
  JOIN "lookup_value" p ON p."id" = v."parent_value_id"
) AS link
WHERE child."id" = link.child_list;--> statement-breakpoint

-- Product Sub Type depends on Product Type. Stated rather than derived,
-- because no garment value has a product type parent yet — no product type in
-- the list is a garment. That dependency is what hides the field on a saree,
-- and now it hides it for the right reason.
UPDATE "lookup_list"
SET "parent_list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'product_type')
WHERE "code" = 'garment_type';--> statement-breakpoint

-- Sold By is not a classification anyone fills in; it is answered by choosing
-- a product type. Saying so where the list is listed.
UPDATE "lookup_list"
SET "description" = 'How a product type is measured. Never chosen on a record — each product type states its own, and the record follows.',
    "updated_at" = now()
WHERE "code" = 'uom';

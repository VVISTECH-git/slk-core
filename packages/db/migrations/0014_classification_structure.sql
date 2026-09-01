-- The structure of the vocabulary, recorded rather than implied.
--
-- Some lists depend on another: a Silk Sub Family only means something once a
-- Fibre Type is chosen, a Motif belongs under a Motif Category, a Product Sub
-- Type under a Product Type. That relationship existed — every value carries
-- `parent_value_id` — but the *list-level* fact, "this classification depends
-- on that one", lived only in the seed file. It resolved parents once at seed
-- time and was then forgotten, so nothing could show or edit it.
--
-- Now it is a column, which is what makes Operational Standard able to say
-- Dependent: Yes, Dependent On: Fibre Type — and able to change it.

ALTER TABLE "lookup_list" ADD COLUMN "parent_list_id" uuid
  REFERENCES "lookup_list"("id") ON DELETE RESTRICT;--> statement-breakpoint

-- Whether the classification is in use at all.
--
-- Separate from a value's status on purpose. A value is retired one at a
-- time; a classification is switched off wholesale — Border Style is not
-- wanted any more, so stop asking the question rather than retiring four
-- values and leaving an empty dropdown.
ALTER TABLE "lookup_list" ADD COLUMN "is_enabled" boolean NOT NULL DEFAULT true;--> statement-breakpoint

ALTER TABLE "lookup_list" ADD COLUMN "status" text NOT NULL DEFAULT 'active';--> statement-breakpoint

ALTER TABLE "lookup_list" ADD CONSTRAINT "lookup_list_status_known"
  CHECK ("status" IN ('draft', 'active', 'retired'));--> statement-breakpoint

-- Derived from the data rather than transcribed from the seed, so it says
-- what is actually true: if a list's values point at parents, the list those
-- parents live in is the one it depends on.
UPDATE "lookup_list" child
SET "parent_list_id" = link.parent_list
FROM (
  SELECT DISTINCT v."list_id" AS child_list, p."list_id" AS parent_list
  FROM "lookup_value" v
  JOIN "lookup_value" p ON p."id" = v."parent_value_id"
) AS link
WHERE child."id" = link.child_list;--> statement-breakpoint

-- Product Sub Type depends on Product Type. Stated here because it has no
-- parented values yet to derive it from — no product type in the list is a
-- garment — and the dependency is the point: it is what hides the field on a
-- saree.
UPDATE "lookup_list"
SET "parent_list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'product_type')
WHERE "code" = 'garment_type' AND "parent_list_id" IS NULL;--> statement-breakpoint

-- Border Style was retired in 0009 by retiring all four of its values. Now
-- that a classification can be switched off in one place, say it there too.
UPDATE "lookup_list"
SET "is_enabled" = false, "status" = 'retired'
WHERE "code" = 'border_style';

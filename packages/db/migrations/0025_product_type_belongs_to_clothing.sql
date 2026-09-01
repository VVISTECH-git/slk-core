-- Product Type belongs to Clothing, and a motif is a motif wherever it sits.
--
-- Two changes with the same shape: a field should only be asked when the
-- answer above it makes it meaningful, and that fact belongs in the data
-- rather than in a condition in the form.
--
-- 1 · Saree, Dupatta, Fabric and the rest are Clothing product types. They
--     were offered under every industry that was not Home, which was fine
--     while there were two industries and wrong the moment a third appeared.
--     Parenting them to Clothing makes the field narrow itself the way every
--     other dependent field already does, and a new industry gets an empty
--     Product Type rather than Clothing's.
--
-- 2 · Pallu Motif reads the Motif list, as Saree Body Motif and Blouse Motif
--     do. One vocabulary for motifs, wherever on the cloth they appear. The
--     old Pallu Design values — Plain Pallu, Zari Pallu, Same as Border — are
--     not motifs; they describe a finish. That list is retired and the column
--     stays for the records that carry it.

UPDATE "lookup_value" v
SET "parent_value_id" = (
      SELECT "id" FROM "lookup_value"
      WHERE "list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'industry')
        AND "label" = 'Clothing'
    ),
    "updated_at" = now()
WHERE v."list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'product_type')
  AND v."parent_value_id" IS NULL;--> statement-breakpoint

-- Said where the list is described, since the dependency is now real.
UPDATE "lookup_list"
SET "parent_list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'industry'),
    "description" = 'What kind of thing it is. Offered under Clothing; Home & Lifestyle has its own list.',
    "updated_at" = now()
WHERE "code" = 'product_type';--> statement-breakpoint

ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "pallu_motif_id" uuid
  REFERENCES "lookup_value"("id") ON DELETE RESTRICT;--> statement-breakpoint

UPDATE "lookup_list"
SET "is_enabled" = false,
    "status" = 'retired',
    "description" = 'Replaced by Pallu Motif, which reads the Motif list. These described a finish rather than a motif. Kept because records still carry them.',
    "updated_at" = now()
WHERE "code" = 'pallu_design';--> statement-breakpoint

UPDATE "lookup_value"
SET "status" = 'retired', "updated_at" = now()
WHERE "list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'pallu_design');

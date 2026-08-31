-- One casing convention, in storage.
--
-- The workbook keeps `colour` and `descriptor` in lower case, and the seed
-- carried that in faithfully. Everything else in the vocabulary is Init Caps,
-- so the application ended up with two conventions and reconciled them at
-- every point of reading — which leaked immediately: the same value read
-- "Contrast" on one screen and "contrast" on another, and title-casing on
-- display turned "Up to 3 inch" into "Up To 3 Inch".
--
-- Storing what should be read is simpler than transforming it everywhere it
-- is read. `initcap` is exactly the rule the application applies on write, so
-- after this the two agree.

UPDATE "lookup_value" v
SET "label" = initcap(v."label"),
    "updated_at" = now()
FROM "lookup_list" l
WHERE l."id" = v."list_id"
  AND l."lowercase_values"
  AND v."label" <> initcap(v."label");--> statement-breakpoint

-- With nothing stored lower case, the flag that said so has no readers. A
-- column the application no longer honours is worse than no column: the next
-- person to find it will believe it still means something.
ALTER TABLE "lookup_list" DROP COLUMN "lowercase_values";

-- One lifecycle, expressed once.
--
-- A value's state was three independent booleans — is_active, is_proposed,
-- needs_review — which between them describe eight combinations, of which
-- three mean anything. Retired + Proposed is representable and meaningless,
-- and every screen reading the vocabulary had to reconstruct the real state
-- from the pair.
--
-- Status is the state. Needs review stays a flag, because it genuinely is
-- one: a value can need checking against real stock while being draft,
-- proposed or active, and clearing the query does not change where the value
-- sits in its life.

ALTER TABLE "lookup_value" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint

-- Order matters. A proposal that was also retired is retired: it was
-- considered and rejected, which is further along than still being proposed.
UPDATE "lookup_value" SET "status" =
  CASE
    WHEN NOT "is_active"  THEN 'retired'
    WHEN "is_proposed"    THEN 'proposed'
    ELSE 'active'
  END;--> statement-breakpoint

ALTER TABLE "lookup_value" ADD CONSTRAINT "lookup_value_status_known"
  CHECK ("status" IN ('draft', 'proposed', 'active', 'retired'));--> statement-breakpoint

-- The partial index that allows one default per list read is_default alone.
-- A retired value cannot be a default, and the application refuses to make
-- one, but the index is where that belongs: it survives a bad code path.
DROP INDEX IF EXISTS "lookup_value_one_default_per_list";--> statement-breakpoint

UPDATE "lookup_value" SET "is_default" = false
  WHERE "is_default" AND "status" <> 'active';--> statement-breakpoint

CREATE UNIQUE INDEX "lookup_value_one_default_per_list"
  ON "lookup_value" USING btree ("list_id")
  WHERE "lookup_value"."is_default";--> statement-breakpoint

ALTER TABLE "lookup_value" DROP COLUMN "is_active";--> statement-breakpoint
ALTER TABLE "lookup_value" DROP COLUMN "is_proposed";--> statement-breakpoint

-- What the value means, for the people choosing between two that sound alike.
-- Jamdani and Jamevar are not distinguishable from their names alone.
ALTER TABLE "lookup_value" ADD COLUMN "description" text;--> statement-breakpoint

-- Offered before the values are, so the directory can be read in a sensible
-- order rather than alphabetically by accident.
ALTER TABLE "lookup_list" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

CREATE INDEX "lookup_value_list_status_idx"
  ON "lookup_value" USING btree ("list_id", "status");

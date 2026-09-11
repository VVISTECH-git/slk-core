-- The editorial review pipeline: draft, submitted, needs changes, approved.
--
-- Nothing in this schema currently distinguishes "a record someone is still
-- filling in" from "a record ready for a customer to see" — design.status is
-- active/archived, a lifecycle flag, and reusing it would conflate archiving
-- a colour that has stopped selling with a colour nobody has checked yet.
-- Those are different facts about different moments in a record's life.
--
-- Lives on colourway, not design: the editor already edits one colourway at
-- a time, one colour of a design can be ready for Shopify while another
-- colour of the same design is still being typed in, and price/images
-- already live at this level for the same reason.
--
-- Existing colourways backfill straight to 'approved' — they are already
-- live on Shopify, and leaving them at 'draft' would make an Approved queue
-- built on this column lie about what is actually selling.

ALTER TABLE "colourway" ADD COLUMN IF NOT EXISTS "review_status" text NOT NULL DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "colourway" ADD COLUMN IF NOT EXISTS "created_by_id" uuid REFERENCES "actor"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "colourway" ADD COLUMN IF NOT EXISTS "updated_by_id" uuid REFERENCES "actor"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "colourway" ADD COLUMN IF NOT EXISTS "submitted_by_id" uuid REFERENCES "actor"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "colourway" ADD COLUMN IF NOT EXISTS "submitted_at" timestamptz;--> statement-breakpoint
ALTER TABLE "colourway" ADD COLUMN IF NOT EXISTS "reviewed_by_id" uuid REFERENCES "actor"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "colourway" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamptz;--> statement-breakpoint

-- Taxable / tracked / continue-selling-out-of-stock: per-colourway inventory
-- policy facts, requested alongside the review pipeline but independent of
-- it — a channel's own behaviour, not a review outcome.
ALTER TABLE "colourway" ADD COLUMN IF NOT EXISTS "is_taxable" boolean NOT NULL DEFAULT true;--> statement-breakpoint
ALTER TABLE "colourway" ADD COLUMN IF NOT EXISTS "tracks_inventory" boolean NOT NULL DEFAULT true;--> statement-breakpoint
ALTER TABLE "colourway" ADD COLUMN IF NOT EXISTS "continue_selling_oos" boolean NOT NULL DEFAULT false;--> statement-breakpoint

UPDATE "colourway" SET "review_status" = 'approved' WHERE "review_status" = 'draft';--> statement-breakpoint

ALTER TABLE "colourway" ADD CONSTRAINT "colourway_review_status_known"
  CHECK ("review_status" IN ('draft', 'submitted', 'needs_changes', 'approved'));--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "colourway_review_status_idx" ON "colourway" ("review_status", "updated_at");--> statement-breakpoint

-- The trail behind the four columns above — every transition, who made it,
-- what they said. Append-only, same reasoning as movement: a rejection that
-- happened and was later approved is a fact, not something to overwrite.
CREATE TABLE IF NOT EXISTS "record_review_event" (
  "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "colourway_id" uuid NOT NULL REFERENCES "colourway"("id") ON DELETE CASCADE,
  "actor_id" uuid REFERENCES "actor"("id") ON DELETE RESTRICT,
  "from_status" text,
  "to_status" text NOT NULL,
  "comment" text,
  "flagged_fields" jsonb NOT NULL DEFAULT '[]',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "record_review_event_to_status_known"
    CHECK ("to_status" IN ('draft', 'submitted', 'needs_changes', 'approved'))
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "record_review_event_colourway_idx" ON "record_review_event" ("colourway_id", "created_at");--> statement-breakpoint

-- One row per already-approved colourway, so the Approved queue's own
-- history does not start blank — the review screen can say "approved,
-- carried over from before this trail existed" rather than showing nothing.
INSERT INTO "record_review_event" ("colourway_id", "to_status", "comment")
SELECT "id", 'approved', 'Carried over: already live before the review workflow existed.'
FROM "colourway"
WHERE "review_status" = 'approved';--> statement-breakpoint

-- Shopify's own product status, per channel link — null until the first
-- push (no listing yet, not an unknown status). Every push to date hardcoded
-- ACTIVE, so a batch link with a product id already on it backfills to
-- 'active'; the Shopify Draft workflow step is what first has a reason to
-- write 'draft'.
ALTER TABLE "channel_link" ADD COLUMN IF NOT EXISTS "shopify_status" text;--> statement-breakpoint

UPDATE "channel_link" SET "shopify_status" = 'active' WHERE "shopify_product_id" IS NOT NULL;--> statement-breakpoint

ALTER TABLE "channel_link" ADD CONSTRAINT "channel_link_shopify_status_known"
  CHECK ("shopify_status" IS NULL OR "shopify_status" IN ('draft', 'active', 'archived'));

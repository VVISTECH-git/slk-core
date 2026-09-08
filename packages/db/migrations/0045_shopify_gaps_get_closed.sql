-- Two facts the bridge could not previously say out loud.
--
-- channel_link.last_push_error / last_pushed_at: every push after the first
-- one runs unattended — a save, an image upload, a movement — and until now
-- a failure there went to console.error and nowhere else. Written on every
-- attempt, success or not, so a listing quietly out of step with Shopify is
-- visible on the Channels page instead of waiting for a customer to notice.
--
-- reservation.fulfilled_at / fulfillment_error: our own status turning
-- 'fulfilled' means the piece physically left the shelf. Whether Shopify's
-- order — and the customer's shipping email — heard about it is a second,
-- separate fact that nothing wrote before this.

ALTER TABLE "channel_link" ADD COLUMN "last_push_error" text;--> statement-breakpoint
ALTER TABLE "channel_link" ADD COLUMN "last_pushed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reservation" ADD COLUMN "fulfilled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reservation" ADD COLUMN "fulfillment_error" text;--> statement-breakpoint

COMMENT ON COLUMN "channel_link"."last_push_error" IS
  'Null with a recent last_pushed_at is healthy. Non-null is what the nightly reconciliation retries and what the Channels page turns red.';--> statement-breakpoint
COMMENT ON COLUMN "reservation"."fulfilled_at" IS
  'Null with status = ''fulfilled'' means packed here but Shopify was never told — no shipping email went out.';

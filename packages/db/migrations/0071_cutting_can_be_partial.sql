-- Cutting can be partial after all — see the "Re-revised" note in
-- docs/decisions/0002-a-piece-can-exist-before-its-product-does.md. A bale
-- moves to `cutting_in_progress` once at least one Thaan is recorded from
-- it, and only reaches `cut` once someone says nothing more will be cut.

ALTER TABLE "bale" DROP CONSTRAINT "bale_status_known";--> statement-breakpoint
ALTER TABLE "bale" ADD CONSTRAINT "bale_status_known"
  CHECK ("bale"."status" in ('awaiting_cutting', 'cutting_in_progress', 'cut', 'returned'));

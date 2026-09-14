-- Reverting 0075: a vendor doing Label Stitching is already expressed by
-- "Label Stitching" being in their own `stages` list, the same as every
-- other stage a vendor does — a separate "Master" flag was a second,
-- redundant way of saying the same thing. Whoever generates QR codes now
-- looks up the vendor with 'Label Stitching' in `stages` directly.

DROP INDEX "vendor_one_label_master";--> statement-breakpoint
ALTER TABLE "vendor" DROP COLUMN "is_label_master";

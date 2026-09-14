-- "The Master" — the tailor every freshly QR-coded batch of Thaans is
-- automatically sent to for Label Stitching, at the moment "Generate QR
-- codes" runs. At most one vendor at a time; the partial unique index is
-- what makes that a guarantee rather than a hope, the same pattern
-- handover's own "at most one open row per Thaan" index uses.

ALTER TABLE "vendor" ADD COLUMN "is_label_master" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_one_label_master" ON "vendor" USING btree ("is_label_master") WHERE "vendor"."is_label_master";

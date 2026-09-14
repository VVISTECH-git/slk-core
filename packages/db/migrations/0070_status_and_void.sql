-- A supplier or cloth item stops being offered for a new bale without
-- erasing their history — active/inactive, same shape as the catalogue's
-- own lookup_value status. And a Thaan can be flagged unusable (damaged,
-- miscounted) without deleting the row, which would break every Handover
-- that already references it.

ALTER TABLE "supplier" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_status_known" CHECK ("supplier"."status" in ('active', 'inactive'));--> statement-breakpoint

ALTER TABLE "cloth_item" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "cloth_item" ADD CONSTRAINT "cloth_item_status_known" CHECK ("cloth_item"."status" in ('active', 'inactive'));--> statement-breakpoint

ALTER TABLE "thaan" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "thaan" ADD COLUMN "voided_by_id" uuid;--> statement-breakpoint

ALTER TABLE "thaan" ADD CONSTRAINT "thaan_voided_by_id_actor_id_fk"
  FOREIGN KEY ("voided_by_id") REFERENCES "public"."actor"("id")
  ON DELETE restrict ON UPDATE no action;

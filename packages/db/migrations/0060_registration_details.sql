-- Both Supplier and Vendor were name-only so far. A real registration
-- needs more than that to actually be useful day to day — asked for and
-- confirmed with the client before building further on top of either list.

ALTER TABLE "supplier" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "gstin" text;--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "contact_person" text;--> statement-breakpoint

ALTER TABLE "vendor" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "vendor" ADD COLUMN "village" text;--> statement-breakpoint
ALTER TABLE "vendor" ADD COLUMN "stages" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "vendor" ADD COLUMN "notes" text;

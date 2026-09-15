-- A vendor's one "phone" field becomes two: the number that actually gets
-- called, and a backup for when it doesn't answer.

ALTER TABLE "vendor" RENAME COLUMN "phone" TO "primary_phone";--> statement-breakpoint
ALTER TABLE "vendor" ADD COLUMN "secondary_phone" text;

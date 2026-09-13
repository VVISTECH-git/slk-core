-- Kora to Shelf, step two continued: two more things the spreadsheet had
-- that the first pass of the supplier rework missed.
--
-- 1. "Item Name" was itself a maintained dropdown in the spreadsheet (~35
--    specific cloth names, e.g. "Cotton Fabric A40s"), not free text. It
--    gets the same treatment as supplier: its own table, referenced by id,
--    so a name is picked once and reused rather than retyped (and
--    misspelled) on every bale.
--
-- 2. "Bale status" had four values in the spreadsheet, not two: Cutting
--    Done, Cutting going on, Cutting not Started, and Bale Returned. "Going
--    on" is deliberately not carried over — the business asked for cutting
--    to be a single sitting, so there is no in-progress state to track —
--    but "Returned" (a bale sent back to the supplier) is a real status
--    this app had no way to record, and now does.
--
-- Safe as a hard replacement, not a data migration: `bale` is still empty
-- in production.

CREATE TABLE "cloth_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX "cloth_item_name_key" ON "cloth_item" USING btree ("name");--> statement-breakpoint

ALTER TABLE "bale" ADD COLUMN "item_id" uuid;--> statement-breakpoint
ALTER TABLE "bale" ALTER COLUMN "item_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bale" DROP COLUMN "item_description";--> statement-breakpoint

ALTER TABLE "bale" ADD CONSTRAINT "bale_item_id_cloth_item_id_fk"
  FOREIGN KEY ("item_id") REFERENCES "public"."cloth_item"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "bale" DROP CONSTRAINT "bale_status_known";--> statement-breakpoint
ALTER TABLE "bale" ADD CONSTRAINT "bale_status_known"
  CHECK ("bale"."status" in ('awaiting_cutting', 'cut', 'returned'));

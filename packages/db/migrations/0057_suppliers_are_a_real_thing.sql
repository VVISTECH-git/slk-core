-- Kora to Shelf, step two: suppliers are a real thing, not free text.
--
-- Supplier was free text in the first pass at this table — a shortcut taken
-- to get bale intake working at all, flagged as worth revisiting once there
-- was real data to look at. There is not yet, but the business has already
-- asked for it: a maintained supplier list, and bale codes that carry the
-- same per-supplier letter the old spreadsheet already used (A3 for APA's
-- third bale, not a plain running number that ignores who it came from).
--
-- Also fills in three columns the spreadsheet had and the first pass
-- dropped without saying so: the broad Type category (Sarees, Fabric,
-- Chunnies, Bedsheets, Pillows — the same five the spreadsheet's own
-- "Unique Items" sheet names), the unit of measure, and a general notes
-- field (the spreadsheet's own "Column 1").
--
-- A hard replacement rather than a migration of existing data, safely:
-- nothing has been entered into `bale` in production yet.

CREATE TABLE "supplier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code_prefix" text NOT NULL,
	"next_bale_number" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX "supplier_name_key" ON "supplier" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_code_prefix_key" ON "supplier" USING btree ("code_prefix");--> statement-breakpoint

ALTER TABLE "bale" DROP COLUMN "supplier_name";--> statement-breakpoint
ALTER TABLE "bale" ADD COLUMN "supplier_id" uuid;--> statement-breakpoint
ALTER TABLE "bale" ADD COLUMN "type" text;--> statement-breakpoint
ALTER TABLE "bale" ADD COLUMN "uom" text DEFAULT 'Mtrs' NOT NULL;--> statement-breakpoint
ALTER TABLE "bale" ADD COLUMN "notes" text;--> statement-breakpoint

-- supplier_id and type have no sensible default for a row that might
-- already exist, so they are added nullable above and tightened here — the
-- standard two-step for a NOT NULL column on a table that could have data.
-- Harmless today: `bale` is empty in production.
ALTER TABLE "bale" ALTER COLUMN "supplier_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bale" ALTER COLUMN "type" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "bale" ADD CONSTRAINT "bale_supplier_id_supplier_id_fk"
  FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "bale" ADD CONSTRAINT "bale_uom_known"
  CHECK ("bale"."uom" in ('Mtrs', 'Nos'));--> statement-breakpoint

ALTER TABLE "bale" ADD CONSTRAINT "bale_type_known"
  CHECK ("bale"."type" in ('Sarees', 'Fabric', 'Chunnies', 'Bedsheets', 'Pillows'));--> statement-breakpoint

-- Superseded by supplier.next_bale_number — a bale's code is now its
-- supplier's own letter plus that counter, not one shared running number.
DROP SEQUENCE IF EXISTS "bale_code_seq";

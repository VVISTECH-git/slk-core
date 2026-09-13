-- The other side of "who kora cloth is bought from" — who does the actual
-- processing at each stage (cutting, salava, karakkaya, print, ironing...),
-- matching the spreadsheet's own "Persons" sheet. Just a name for now, no
-- stage attached: the stage pipeline itself is not built yet, so there is
-- nothing yet to link a vendor's stage to. That comes with the handover
-- work later.

CREATE TABLE "vendor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX "vendor_name_key" ON "vendor" USING btree ("name");

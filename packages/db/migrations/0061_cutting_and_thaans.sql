-- Kora to Shelf, step two: cutting a bale into Thaans.
--
-- Not named "piece" — `piece` already exists in the catalogue, meaning a
-- finished, identified saree. A Thaan (the spreadsheet's own term — see its
-- "Per Thaan Mtr" column) is what a bale becomes before any of that is
-- decided, and staying off that name keeps the two things from being
-- confused with each other, on screen or in the schema.
--
-- Cutting a bale creates its Thaans in bulk (one row per piece, all at
-- once — the whole bale is cut in a single sitting) and is a separate act
-- from generating their QR codes: `code` and `qr_generated_at` start null,
-- and a later bulk action fills them in via `thaan_code_seq`.

CREATE SEQUENCE "thaan_code_seq" START WITH 100001;--> statement-breakpoint

CREATE TABLE "thaan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bale_id" uuid NOT NULL,
	"code" text,
	"qr_generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX "thaan_code_key" ON "thaan" USING btree ("code");--> statement-breakpoint

ALTER TABLE "thaan" ADD CONSTRAINT "thaan_bale_id_bale_id_fk"
  FOREIGN KEY ("bale_id") REFERENCES "public"."bale"("id")
  ON DELETE restrict ON UPDATE no action;

ALTER TABLE "thaan" ADD COLUMN "colourway_id" uuid;--> statement-breakpoint
ALTER TABLE "thaan" ADD CONSTRAINT "thaan_colourway_id_colourway_id_fk" FOREIGN KEY ("colourway_id") REFERENCES "public"."colourway"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "thaan_colourway_id_idx" ON "thaan" USING btree ("colourway_id");
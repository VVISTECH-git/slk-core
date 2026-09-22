ALTER TABLE "pile_event" DROP CONSTRAINT "pile_event_kind_known";--> statement-breakpoint
ALTER TABLE "thaan" ADD COLUMN "piece_id" uuid;--> statement-breakpoint
ALTER TABLE "thaan" ADD CONSTRAINT "thaan_piece_id_piece_id_fk" FOREIGN KEY ("piece_id") REFERENCES "public"."piece"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "thaan_piece_id_key" ON "thaan" USING btree ("piece_id");--> statement-breakpoint
ALTER TABLE "pile_event" ADD CONSTRAINT "pile_event_kind_known" CHECK ("pile_event"."kind" in ('created', 'added', 'moved', 'detail_set', 'split', 'photo_set', 'shelved'));
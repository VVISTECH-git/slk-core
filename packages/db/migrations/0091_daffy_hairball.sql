CREATE INDEX "movement_batch_idx" ON "movement" USING btree ("batch_id") WHERE "movement"."batch_id" is not null;--> statement-breakpoint
CREATE INDEX "reservation_held_idx" ON "reservation" USING btree ("created_at") WHERE "reservation"."status" = 'held';--> statement-breakpoint
CREATE INDEX "handover_vendor_open_idx" ON "handover" USING btree ("vendor_id","stage") WHERE "handover"."received_at" is null;--> statement-breakpoint
CREATE INDEX "handover_vendor_transaction_idx" ON "handover" USING btree ("vendor_transaction_id") WHERE "handover"."vendor_transaction_id" is not null;
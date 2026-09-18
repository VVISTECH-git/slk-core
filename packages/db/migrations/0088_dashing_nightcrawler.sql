CREATE INDEX "handover_vendor_id_idx" ON "handover" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "vendor_payment_vendor_id_idx" ON "vendor_payment" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "vendor_transaction_vendor_id_idx" ON "vendor_transaction" USING btree ("vendor_id");
-- "Received" was standing in for the spreadsheet's own "Bill Entry Date"
-- (when the bill was entered into the system) without being named that or
-- being editable — it was stamped to the moment of creation and stuck
-- there. That's a different date from `invoice_date` (when the supplier
-- prepared the invoice), and conflating the two, or leaving it
-- unbackdatable, breaks entering an old bale late with its real date.
--
-- A plain date, not a timestamp: like invoice_date, this is a calendar
-- date a person picks, not a precise moment.

ALTER TABLE "bale" ADD COLUMN "bill_entry_date" date;--> statement-breakpoint
UPDATE "bale" SET "bill_entry_date" = "received_at"::date;--> statement-breakpoint
ALTER TABLE "bale" ALTER COLUMN "bill_entry_date" SET DEFAULT current_date;--> statement-breakpoint
ALTER TABLE "bale" ALTER COLUMN "bill_entry_date" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bale" DROP COLUMN "received_at";

-- The bill's own total, in rupees — missing until now. Same nullability
-- as invoice number and date: goods sometimes arrive before the bill
-- does.

ALTER TABLE "bale" ADD COLUMN "invoice_amount" numeric(12, 2);

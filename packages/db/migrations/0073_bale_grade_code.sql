-- SLK's own code for how premium a batch of cloth is — a mark the office
-- enters itself, not something the supplier's bill carries. Nullable and
-- freeform: it's short and varies (A3, A4, G5, PS, CMC...), not a fixed
-- list, and the same cloth item can carry a different code bale to bale.

ALTER TABLE "bale" ADD COLUMN "grade_code" text;

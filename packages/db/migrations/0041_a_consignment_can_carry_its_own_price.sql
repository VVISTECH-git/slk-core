-- Prices lived on the colourway, which said that every consignment of a design
-- in a colour sells for the same money. That was true while the catalogue was
-- the thing being sold. It stops being true the moment the consignment is.
--
-- Handloom does not repeat. The indigo in March is not the indigo in July, the
-- cotton costs what it costs that month, and two runs of the same teal saree
-- can be worth different money. Shopify will list each consignment separately
-- for exactly that reason, and a listing that cannot carry its own price is
-- not a listing.
--
-- Overrides, not copies. Null means "whatever the line sells for", so nothing
-- has to be backfilled, every existing consignment behaves precisely as it did
-- yesterday, and correcting the colourway's price still reaches every batch
-- that has not deliberately departed from it. A consignment carries a price
-- only when this cloth is genuinely worth something else — and then it says
-- so, rather than being a number that silently drifted from its neighbours.
--
-- bigint in paise, matching the colourway. A rupee is a hundred paise and
-- rounding a price is always a bug.

ALTER TABLE "batch" ADD COLUMN "cost_minor" bigint;--> statement-breakpoint
ALTER TABLE "batch" ADD COLUMN "making_minor" bigint;--> statement-breakpoint
ALTER TABLE "batch" ADD COLUMN "wholesale_minor" bigint;--> statement-breakpoint
ALTER TABLE "batch" ADD COLUMN "retail_minor" bigint;--> statement-breakpoint
ALTER TABLE "batch" ADD COLUMN "mrp_minor" bigint;--> statement-breakpoint

COMMENT ON COLUMN "batch"."retail_minor" IS
  'What this consignment sells for, when it differs from the line. Null inherits the colourway''s price — read it through batch_price.';--> statement-breakpoint

-- A price is not negative. The colourway has no such constraint and should;
-- adding it there means checking every existing row, which is its own
-- decision, so the new columns at least start out correct.
ALTER TABLE "batch" ADD CONSTRAINT "batch_prices_not_negative" CHECK (
  coalesce("cost_minor", 0)      >= 0 AND
  coalesce("making_minor", 0)    >= 0 AND
  coalesce("wholesale_minor", 0) >= 0 AND
  coalesce("retail_minor", 0)    >= 0 AND
  coalesce("mrp_minor", 0)       >= 0
);--> statement-breakpoint

-- What a consignment actually sells for, resolved once.
--
-- Every screen and, later, the channel bridge read this rather than each
-- writing its own coalesce. Three copies of "the batch price, or the line's"
-- is how one of them ends up disagreeing — which is the bug the rupees helper
-- was written to end the last time it happened, on two screens showing
-- 4,250.75 and 4,251 for the same saree.
CREATE VIEW batch_price AS
SELECT
  b.id                                              AS batch_id,
  b.colourway_id,
  b.code,
  COALESCE(b.cost_minor,      cw.cost_minor)        AS cost_minor,
  COALESCE(b.making_minor,    cw.making_minor)      AS making_minor,
  COALESCE(b.wholesale_minor, cw.wholesale_minor)   AS wholesale_minor,
  COALESCE(b.retail_minor,    cw.retail_minor)      AS retail_minor,
  COALESCE(b.mrp_minor,       cw.mrp_minor)         AS mrp_minor,
  cw.currency,
  -- So a screen can say "priced for this consignment" without comparing five
  -- pairs of numbers to work it out.
  (b.cost_minor      IS NOT NULL OR
   b.making_minor    IS NOT NULL OR
   b.wholesale_minor IS NOT NULL OR
   b.retail_minor    IS NOT NULL OR
   b.mrp_minor       IS NOT NULL)                   AS is_overridden
FROM batch b
JOIN colourway cw ON cw.id = b.colourway_id;--> statement-breakpoint

COMMENT ON VIEW batch_price IS
  'What a consignment sells for: its own price where it has one, the colourway''s otherwise. Currency stays on the colourway — SLK prices in one.';

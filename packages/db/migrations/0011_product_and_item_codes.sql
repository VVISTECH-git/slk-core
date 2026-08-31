-- Product codes, item codes, and the consignment they belong to.
--
-- The design code — SAR-MAN-SIL-0002 — describes what somebody entered, and
-- it cannot be an identity. Two warehouse people looking at the same
-- Kalamkari saree will name different motifs, and SLK's decision is that
-- whatever they enter is accepted rather than argued about. So the
-- description repeats, and identity has to come from counting instead.
--
--   design code   what it is, as entered. Repeats. Internal, not displayed.
--   product code  one consignment. Received again tomorrow, new code.
--   item code     one physical saree.
--
-- Ten pieces arriving on Tuesday are one product code and ten item codes.
-- The same ten arriving again in March are a different product code.

-- Counters rather than computed strings, because a code that is derived from
-- attributes becomes wrong when an attribute is corrected — and these are
-- printed on labels stuck to cloth.
--
-- The series digit is where the counter starts, not a range it stays inside:
-- 399999 is followed by 400000 and nothing breaks. Products start at 3 and
-- items at 5 so both have room before they would meet.
CREATE SEQUENCE product_code_seq START WITH 300001 INCREMENT BY 1;--> statement-breakpoint
CREATE SEQUENCE item_code_seq    START WITH 500001 INCREMENT BY 1;--> statement-breakpoint

-- One consignment of one colourway.
CREATE TABLE "batch" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "colourway_id" uuid NOT NULL REFERENCES "colourway"("id") ON DELETE RESTRICT,

  -- 300001, 300002 … Assigned once and never recomputed.
  "code"        text NOT NULL,

  -- What was counted in, and where it landed. The ledger is still the
  -- authority on how much is on hand now; this is what arrived that day.
  "qty"         integer NOT NULL,
  "location_id" uuid REFERENCES "location"("id") ON DELETE RESTRICT,

  "received_at" timestamptz NOT NULL DEFAULT now(),
  "reference"   text,
  "note"        text,
  "created_at"  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "batch_qty_positive" CHECK ("qty" > 0)
);--> statement-breakpoint

CREATE UNIQUE INDEX "batch_code_key" ON "batch" ("code");--> statement-breakpoint
CREATE INDEX "batch_colourway_idx" ON "batch" ("colourway_id", "received_at");--> statement-breakpoint

-- A piece belongs to the consignment it arrived in. Nullable because the
-- pieces already in the demo catalogue predate consignments and inventing
-- one for them would be inventing a delivery that never happened.
ALTER TABLE "piece" ADD COLUMN "batch_id" uuid REFERENCES "batch"("id") ON DELETE RESTRICT;--> statement-breakpoint
CREATE INDEX "piece_batch_idx" ON "piece" ("batch_id");--> statement-breakpoint

-- The movement that recorded the arrival, so the count and the consignment
-- are the same event rather than two records that might disagree.
ALTER TABLE "movement" ADD COLUMN "batch_id" uuid REFERENCES "batch"("id") ON DELETE RESTRICT;--> statement-breakpoint

-- Two letters per motif category, for the Motif Code column.
--
-- From the category rather than the motif, because the category is the field
-- SLK holds people to — the motif itself is accepted however it is entered.
-- Floral, Fauna and Figures all begin with F, so one letter will not do.
--
-- In `meta` rather than a column of its own: `lookup_value` serves 41 lists
-- and only this one needs an abbreviation, so a column would be null on 216
-- of 227 rows.
UPDATE "lookup_value" v
SET "meta" = v."meta" || jsonb_build_object('abbr', a.abbr)
FROM (VALUES
  ('Floral', 'FL'), ('Fauna', 'FA'), ('Birds', 'BI'),
  ('Figures & Idols', 'FI'), ('Mythology & Story', 'MY'),
  ('Music Instruments', 'MU'), ('Geometric', 'GE'), ('Objects', 'OB'),
  ('Kolam', 'KO'), ('Warli', 'WA'), ('Village Life', 'VI')
) AS a(label, abbr)
WHERE v."label" = a.label
  AND v."list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'motif_category');

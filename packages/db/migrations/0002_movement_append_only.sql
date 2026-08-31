-- The stock ledger is append-only, and this is where that stops being a
-- convention someone can forget.
--
-- A mistake is corrected by appending its reverse, never by editing or
-- deleting a row. Otherwise the ledger stops being an audit trail: the floor
-- count and the system disagree and there is no record of who changed what.

CREATE OR REPLACE FUNCTION movement_is_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'movement is append-only — record a correction instead of editing row %',
    OLD.id
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER movement_no_change
  BEFORE UPDATE OR DELETE ON movement
  FOR EACH ROW EXECUTE FUNCTION movement_is_append_only();
--> statement-breakpoint

-- Constraints the shape of a movement has to satisfy. Checked here rather
-- than only in application code, because the sync worker and the mobile app
-- will both write through the API and neither should be able to get this
-- wrong.

-- A quantity is always positive; direction lives in from/to, not in a sign.
ALTER TABLE movement ADD CONSTRAINT movement_qty_positive
  CHECK (qty > 0);
--> statement-breakpoint

-- A piece is one physical object. It cannot move in a quantity of five.
ALTER TABLE movement ADD CONSTRAINT movement_piece_qty_is_one
  CHECK (piece_id IS NULL OR qty = 1);
--> statement-breakpoint

-- A movement has to come from somewhere or go somewhere.
ALTER TABLE movement ADD CONSTRAINT movement_has_direction
  CHECK (from_location_id IS NOT NULL OR to_location_id IS NOT NULL);
--> statement-breakpoint

-- Moving something to where it already is records nothing.
ALTER TABLE movement ADD CONSTRAINT movement_not_a_circle
  CHECK (from_location_id IS DISTINCT FROM to_location_id);
--> statement-breakpoint

-- Only the kinds the app knows how to derive a count from. Text with a check
-- rather than a Postgres enum: adding a kind should be a one-line migration,
-- not an ALTER TYPE to reason about under load.
ALTER TABLE movement ADD CONSTRAINT movement_kind_known
  CHECK (kind IN (
    'received', 'sold', 'damaged', 'returned', 'adjusted', 'transferred'
  ));
--> statement-breakpoint

-- What we hold, per colourway, across every location we own. Internal minus
-- external is the whole calculation — no special cases per movement kind.
CREATE VIEW colourway_on_hand AS
SELECT
  m.colourway_id,
  SUM(CASE WHEN lt.is_internal THEN m.qty ELSE 0 END)
  - SUM(CASE WHEN lf.is_internal THEN m.qty ELSE 0 END) AS qty
FROM movement m
LEFT JOIN location lt ON lt.id = m.to_location_id
LEFT JOIN location lf ON lf.id = m.from_location_id
GROUP BY m.colourway_id;

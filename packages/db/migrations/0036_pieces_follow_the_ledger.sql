-- Stock Records showed every piece ever minted, at the location it arrived
-- in, forever. A saree that had been sold or written off still read as
-- sitting in the warehouse, and no column on the screen could tell it from
-- one that was really there.
--
-- The cause was that `piece` carried a batch and nothing else: the location
-- came from the consignment it arrived in, which by definition never changes.
-- The ledger already knew better. This view is that knowledge, expressed once
-- so every screen reads the same answer.

CREATE VIEW piece_position AS

-- What the ledger says we hold, per colourway, per location of our own.
-- The same internal-minus-external arithmetic as `colourway_on_hand`, kept
-- per location because "we have twelve" is no help when all twelve are in
-- Pedana and Kompally is trying to sell one.
WITH held AS (
  SELECT colourway_id, location_id, SUM(delta)::int AS qty
  FROM (
    SELECT m.colourway_id, m.to_location_id AS location_id, m.qty AS delta
    FROM movement m
    JOIN location l ON l.id = m.to_location_id AND l.is_internal
    UNION ALL
    SELECT m.colourway_id, m.from_location_id, -m.qty
    FROM movement m
    JOIN location l ON l.id = m.from_location_id AND l.is_internal
  ) ledger
  GROUP BY colourway_id, location_id
  HAVING SUM(delta) > 0
),

-- One row per unit held: the physical places a piece can be standing.
shelf AS (
  SELECT
    h.colourway_id,
    h.location_id,
    ROW_NUMBER() OVER (
      PARTITION BY h.colourway_id
      ORDER BY l.sort_order, l.name, unit
    ) AS slot
  FROM held h
  JOIN location l ON l.id = h.location_id
  CROSS JOIN LATERAL generate_series(1, h.qty) AS unit
),

-- The pieces, newest first, so that filling the shelf leaves the oldest
-- ones over. Which specific saree left is not recorded — a sale is entered
-- as a quantity, not a scan — so first in, first out is the assumption, and
-- it is the one a warehouse makes anyway.
queue AS (
  SELECT
    p.id,
    p.colourway_id,
    ROW_NUMBER() OVER (
      PARTITION BY p.colourway_id ORDER BY p.serial DESC
    ) AS place
  FROM piece p
)

SELECT
  q.id                            AS piece_id,
  s.location_id                   AS location_id,
  (s.location_id IS NOT NULL)     AS is_held
FROM queue q
LEFT JOIN shelf s
  ON s.colourway_id = q.colourway_id AND s.slot = q.place;
--> statement-breakpoint

COMMENT ON VIEW piece_position IS
  'Where each piece is now, derived from the ledger. A piece with no location has left stock. Pieces are matched to held units newest-first, so the oldest are the ones counted as gone.';--> statement-breakpoint


-- ── Classifications read alphabetically ───────────────────────────────────
--
-- Master Lists ordered by sort_order and then label. The seeded lists all
-- share a sort_order, so they came out alphabetical and looked deliberate;
-- anything added on the screen took max + 1 and landed at the bottom, which
-- is why Image Type sat after Weaving Category. There is no meaningful order
-- among classifications, so there should not be a column deciding one.
--
-- Levelled here, and the queries now order by label alone, so a classification
-- added tomorrow files itself in the right place.
UPDATE "lookup_list" SET "sort_order" = 0 WHERE "sort_order" <> 0;--> statement-breakpoint


-- ── Image Type retires ────────────────────────────────────────────────────
--
-- Created on the live screen alongside Image Slot — Saree Body, Saree Pallu,
-- Saree Blouse against Body, Pallu, Border, Blouse — two lists asking one
-- question. Migration 0031 left the choice open because nothing read Image
-- Type and settling it by accident would have been worse than waiting.
--
-- Settled now in favour of Image Slot, which is the list the record editor
-- reads and the one the `image` table points at. Retired rather than deleted:
-- nothing references these values, but a list that turns out to have been
-- wanted is a click to bring back, and a deleted one is not.
UPDATE "lookup_value"
SET "status" = 'retired', "updated_at" = now()
WHERE "list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'image_type')
  AND "status" <> 'retired';--> statement-breakpoint

UPDATE "lookup_list"
SET "is_enabled" = false,
    "status" = 'retired',
    "description" = 'Retired in favour of Image Slot, which is the list the record editor reads and the one image rows point at. Kept so the choice can be reversed.',
    "updated_at" = now()
WHERE "code" = 'image_type';

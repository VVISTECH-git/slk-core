-- Extends "Batch as listing" past Saree to the rest of the pooled product
-- types, per the 11 Sep discussion. Two different treatments, not one:
--
-- Dupatta, Bedsheets, Scarves, Stolls — each a discrete object, same model
-- Saree already uses. Turning serialised on for them is exactly what it was
-- for Saree: a design created from now on gets item codes, and stock is a
-- count of pieces still held. Nothing about how that count works changes.
--
-- Fabric is not a discrete object — cloth sold by the metre has no natural
-- "one piece" the way a saree does. It stays serialised (still listed per
-- batch, still one Shopify listing per bolt, because dye lot and cost still
-- differ run to run) but is not piece-tracked: no item code per half-metre,
-- a running quantity on the batch instead, counted in half-metre units
-- because Shopify's own inventory API has no fractional quantity at all —
-- confirmed against its schema before this was written, not assumed.
--
-- A pre-matched, unstitched set (top + bottom + dupatta for one outfit) is
-- still Fabric underneath, but it is bought whole, not by the length — so
-- whether a Fabric design is piece-tracked or metre-tracked is decided by
-- Unit of Measure, not by product type alone. uom already existed for
-- exactly this ("How a product type is measured. Only product types have
-- one.") — it just always followed the product type until now. Suit Sets,
-- Coord Sets, Patiala Sets, Lehanga Sets and Crop Tops Sets are the five
-- Product Sub Type values that already carry a piece count and were sitting
-- unparented; parenting them under Fabric is what lets a Fabric row ask for
-- one of them and flip back to Piece. See resolveUom in records/actions.ts
-- for where that override actually happens — this migration only touches
-- data, not the derivation logic.
--> statement-breakpoint

UPDATE lookup_value lv
SET meta = coalesce(lv.meta, '{}'::jsonb) || '{"serialised": true}'::jsonb
FROM lookup_list ll
WHERE ll.id = lv.list_id AND ll.code = 'product_type'
  AND lv.code IN ('dupatta', 'bedsheets', 'scarves', 'stolls', 'fabric');
--> statement-breakpoint

UPDATE lookup_value gt
SET parent_value_id = pt.id
FROM lookup_value pt, lookup_list gt_list, lookup_list pt_list
WHERE gt.list_id = gt_list.id AND gt_list.code = 'garment_type'
  AND pt.list_id = pt_list.id AND pt_list.code = 'product_type' AND pt.code = 'fabric'
  AND gt.code IN ('suit-sets', 'coord-sets', 'patiala-sets', 'lehanga-sets', 'crop-tops-sets');
--> statement-breakpoint

-- Missing from Home & Lifestyle until now — surfaced while scoping this
-- same piece of work. Cushion Covers is the one itokri category with
-- nothing in home_product_type to land on.
INSERT INTO lookup_value (list_id, code, label, sort_order)
SELECT ll.id, 'cushion-covers', 'Cushion Covers',
  (SELECT coalesce(max(sort_order), -1) + 1 FROM lookup_value WHERE list_id = ll.id)
FROM lookup_list ll WHERE ll.code = 'home_product_type';
--> statement-breakpoint

-- Held quantity per batch per location, for a design tracked by running
-- quantity rather than by piece — the same movement-ledger arithmetic
-- piece_position's own "held" CTE already does per colourway, done here per
-- batch instead. Unlike a piece-tracked design, a metre-tracked one has to
-- name its batch on every movement, sale included — see packReservation's
-- own comment on why that is a deliberate, narrow exception to "batch_id is
-- only ever set on receipt".
CREATE VIEW batch_measured_qty AS
SELECT batch_id, location_id, sum(delta)::int AS qty
FROM (
  SELECT m.batch_id, m.to_location_id AS location_id, m.qty AS delta
  FROM movement m
  JOIN location l ON l.id = m.to_location_id AND l.is_internal
  WHERE m.batch_id IS NOT NULL
  UNION ALL
  SELECT m.batch_id, m.from_location_id, -m.qty
  FROM movement m
  JOIN location l ON l.id = m.from_location_id AND l.is_internal
  WHERE m.batch_id IS NOT NULL
) ledger
GROUP BY batch_id, location_id
HAVING sum(delta) > 0;
--> statement-breakpoint

COMMENT ON VIEW batch_measured_qty IS
  'Where a metre-tracked batch''s stock actually is, per location — the movement ledger summed by batch_id rather than colourway_id, for the one kind of design that names its batch on every movement, not only on receipt. Half-metre units, matching what Shopify is told; never metres.';
--> statement-breakpoint

-- channel_batch_sellable, extended rather than replaced in meaning: still
-- "what a channel may currently sell of a consignment", still null for a
-- pooled product type. The only change is which ledger a serialised
-- design's held quantity comes from — piece_position's inferred count for
-- everything piece-tracked, batch_measured_qty's recorded count for
-- anything sold by the metre. pool_reserved is untouched: a reservation was
-- already batch-scoped for every design, piece-tracked or not.
CREATE OR REPLACE VIEW channel_batch_sellable AS
WITH
pool_held AS (
  SELECT cp.pool_id, p.batch_id, count(DISTINCT p.id)::int AS qty
  FROM piece p
  JOIN piece_position pp ON pp.piece_id = p.id AND pp.is_held
  JOIN channel_location cl ON cl.location_id = pp.location_id
  JOIN channel_pool cp ON cp.channel_id = cl.channel_id
  GROUP BY cp.pool_id, p.batch_id
),
-- Two channels sharing one location both join to the same batch_measured_qty
-- row here — exactly the fan-out pool_held avoids with count(DISTINCT
-- p.id). A metre-tracked batch has no piece id to de-duplicate on, so the
-- inner SELECT DISTINCT collapses the fan-out itself, one row per distinct
-- (pool, batch, location), before the outer sum adds genuinely different
-- locations together. Missing this the first time round double-counted a
-- shared-shelf batch's stock — caught by actually running it, not by the
-- view merely executing without error.
measured_pool_held AS (
  SELECT pool_id, batch_id, sum(qty)::int AS qty
  FROM (
    SELECT DISTINCT cp.pool_id, bmq.batch_id, bmq.location_id, bmq.qty
    FROM batch_measured_qty bmq
    JOIN channel_location cl ON cl.location_id = bmq.location_id
    JOIN channel_pool cp ON cp.channel_id = cl.channel_id
  ) per_location
  GROUP BY pool_id, batch_id
),
pool_reserved AS (
  SELECT cp.pool_id, r.batch_id, sum(r.qty)::int AS qty
  FROM reservation r
  JOIN channel_pool cp ON cp.channel_id = r.channel_id
  WHERE r.status = 'held'
  GROUP BY cp.pool_id, r.batch_id
)
SELECT
  ch.id                                       AS channel_id,
  b.id                                        AS batch_id,
  b.colourway_id,
  b.code,
  d.is_serialised,
  CASE WHEN d.is_serialised THEN
    coalesce(CASE WHEN uom.code = 'metre' THEN measured_pool_held.qty ELSE pool_held.qty END, 0)
  END                                          AS on_hand,
  CASE WHEN d.is_serialised THEN coalesce(pool_reserved.qty, 0) END AS reserved,
  CASE WHEN d.is_serialised THEN
    coalesce(CASE WHEN uom.code = 'metre' THEN measured_pool_held.qty ELSE pool_held.qty END, 0)
    - coalesce(pool_reserved.qty, 0)
  END                                          AS sellable,
  -- Appended, not inserted between existing columns: CREATE OR REPLACE VIEW
  -- refuses to change an existing view's column order or rename one, only
  -- to add new columns at the end. Confirmed the hard way — see this
  -- migration's own history on the backup branch before this fix.
  coalesce(uom.code = 'metre', false)         AS sold_by_metre
FROM channel ch
JOIN channel_pool cp     ON cp.channel_id = ch.id
JOIN batch b             ON true
JOIN colourway c         ON c.id = b.colourway_id
JOIN design d            ON d.id = c.design_id
LEFT JOIN lookup_value uom ON uom.id = d.uom_id
LEFT JOIN pool_held          ON pool_held.pool_id = cp.pool_id AND pool_held.batch_id = b.id
LEFT JOIN measured_pool_held ON measured_pool_held.pool_id = cp.pool_id AND measured_pool_held.batch_id = b.id
LEFT JOIN pool_reserved      ON pool_reserved.pool_id = cp.pool_id AND pool_reserved.batch_id = b.id
WHERE ch.is_active;
--> statement-breakpoint

COMMENT ON VIEW channel_batch_sellable IS
  'What a channel may currently sell of a consignment: held quantity (piece_position''s inferred count for a piece-tracked design, batch_measured_qty''s recorded count for a metre-tracked one) minus every open reservation from any channel sharing its shelf. Null for a pooled product type. sold_by_metre says which counting rule applied, and that on_hand/sellable are half-metre units, not pieces, for that row.';

-- SLK's own store and Aartisanz sell from the same shelf in Hyderabad: two
-- separate owners, two separate Shopify stores, both channels pointed at
-- some of the same `location` rows through `channel_location`.
-- channel_batch_sellable did not know that. Its `held` counted every piece
-- a channel could see — correct — but its `reserved` only ever summed that
-- one channel's own reservations. An order booked on Aartisanz never
-- touched what SLK's storefront believed it could still sell of the exact
-- same piece, and the reverse held too: a saree stayed listed available on
-- both stores until it was bought a second time. Confirmed live — three
-- serials were sitting available:true on both storefronts at once, and had
-- been since whichever one sold first.
--
-- The fix has nothing to do with which owner a channel belongs to; it
-- follows the physical fact underneath it: two channels that share even one
-- location are drawing on the same shelf, so a hold placed through either
-- one has to come off what both believe they can sell.
--
-- Pulled out as its own view rather than folded straight into
-- channel_batch_sellable, because the same grouping is what the oversell
-- guard on the booking side needs too — one definition of "which channels
-- share a shelf", read by both.
CREATE OR REPLACE VIEW channel_pool AS
WITH RECURSIVE
active_channel_location AS (
  SELECT cl.channel_id, cl.location_id
  FROM channel_location cl
  JOIN channel ch ON ch.id = cl.channel_id AND ch.is_active
),
-- Every pair of (active) channels that map to at least one location in
-- common.
shares AS (
  SELECT DISTINCT a.channel_id AS x, b.channel_id AS y
  FROM active_channel_location a
  JOIN active_channel_location b
    ON b.location_id = a.location_id AND b.channel_id <> a.channel_id
),
-- `shares` followed transitively, so a chain of three channels sharing
-- locations pairwise ends up one pool, not two — a general fix, not a
-- two-channel special case.
reachable AS (
  SELECT id AS channel_id, id AS reached FROM channel WHERE is_active
  UNION
  SELECT r.channel_id, s.y
  FROM reachable r
  JOIN shares s ON s.x = r.reached
)
-- Each connected group collapsed to its smallest channel id. Arbitrary, but
-- stable — it only has to be the same value for every channel in the group.
-- A channel that shares nothing with anything reaches only itself, so it is
-- a pool of one, and everything downstream reduces to exactly what it was
-- before this migration — single-channel locations are unaffected.
--
-- min(uuid) is not a function Postgres defines; sorted array-and-index picks
-- the same "smallest" deterministically instead.
SELECT channel_id, (array_agg(reached ORDER BY reached))[1] AS pool_id
FROM reachable
GROUP BY channel_id;
--> statement-breakpoint

COMMENT ON VIEW channel_pool IS
  'Which channels share a physical shelf, collapsed to one representative channel id per group (the "pool id") — two channels appear here with the same pool_id exactly when a piece at one of them could just as well have been sold through the other. A channel sharing no location with anything is its own pool of one.';--> statement-breakpoint

-- Restricted to active channels throughout: a retired channel's old
-- `channel_location` rows must never pull a currently active channel into
-- seeing stock at a location it never actually shared with anything live,
-- or into a pool with a channel that no longer takes orders at all — see
-- channel_pool's own definition.
CREATE OR REPLACE VIEW channel_batch_sellable AS
WITH
-- Physical pieces held at any location any channel in the pool can draw
-- from — a piece counted once even where two of the pool's channels happen
-- to map to the very same location.
pool_held AS (
  SELECT cp.pool_id, p.batch_id, count(DISTINCT p.id)::int AS qty
  FROM piece p
  JOIN piece_position pp ON pp.piece_id = p.id AND pp.is_held
  JOIN channel_location cl ON cl.location_id = pp.location_id
  JOIN channel_pool cp ON cp.channel_id = cl.channel_id
  GROUP BY cp.pool_id, p.batch_id
),
-- Every open hold from every channel in the pool — the actual fix: a hold
-- placed through one owner's storefront now comes off what every other
-- storefront sharing its shelf believes it can still sell.
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
  CASE WHEN d.is_serialised THEN coalesce(pool_held.qty, 0) END       AS on_hand,
  CASE WHEN d.is_serialised THEN coalesce(pool_reserved.qty, 0) END   AS reserved,
  CASE WHEN d.is_serialised
    THEN coalesce(pool_held.qty, 0) - coalesce(pool_reserved.qty, 0)
  END                                                                  AS sellable
FROM channel ch
JOIN channel_pool cp   ON cp.channel_id = ch.id
JOIN batch b           ON true
JOIN colourway c       ON c.id = b.colourway_id
JOIN design d          ON d.id = c.design_id
LEFT JOIN pool_held     ON pool_held.pool_id = cp.pool_id AND pool_held.batch_id = b.id
LEFT JOIN pool_reserved ON pool_reserved.pool_id = cp.pool_id AND pool_reserved.batch_id = b.id
WHERE ch.is_active;
--> statement-breakpoint

COMMENT ON VIEW channel_batch_sellable IS
  'What a channel may currently sell of a consignment: pieces piece_position finds held anywhere a channel sharing its shelf can draw from, minus every open reservation from any channel sharing that shelf. Null for a pooled product type — there is no honest number to give it.';

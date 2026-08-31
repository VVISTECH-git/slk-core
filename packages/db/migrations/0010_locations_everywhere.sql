-- Locations belong in every database, not only the demo one.
--
-- They were created by `db:demo` alongside sample sarees, and that script
-- refuses to run against anything that is not localhost — sample stock has no
-- business in a deployed database. So the deployed database had no locations
-- at all, and without them:
--
--   * "on hand" has nothing to compute over. The whole definition is what
--     sits in internal locations minus what has gone to external ones.
--   * A new record's Stock tab has nothing to offer, so opening stock cannot
--     be recorded.
--   * correctCount falls through to "Count not corrected — no locations are
--     set up", which is a sentence nobody should ever have to read.
--
-- The mistake was classing them as sample data. A warehouse and a scrap bin
-- are not examples of anything; they are the vocabulary the ledger is defined
-- in, in the same way the lookup lists are.
--
-- Inserted only when absent, so a database that already has them — every
-- local one — is untouched, and so a location renamed on Master Lists is not
-- reverted by a later migration run.

INSERT INTO "location" ("code", "name", "is_internal", "sort_order")
SELECT * FROM (VALUES
  ('WH-MAIN',    'Warehouse',     true,  0),
  ('SHOP-01',    'Retail Unit 1', true,  1),
  ('SHOP-02',    'Retail Unit 2', true,  2),
  -- Where stock comes from when it is first counted, and where it goes when
  -- it stops being ours. External, so none of it counts as held.
  ('PRODUCTION', 'Production',    false, 10),
  ('CUSTOMER',   'Customer',      false, 11),
  ('SCRAP',      'Scrap',         false, 12)
) AS seed ("code", "name", "is_internal", "sort_order")
WHERE NOT EXISTS (
  SELECT 1 FROM "location" existing WHERE existing."code" = seed."code"
);

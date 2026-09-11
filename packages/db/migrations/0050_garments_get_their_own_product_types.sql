-- Garments gets its own Product Type, the way Clothing already has one.
--
-- 0025 parented every Product Type value to Clothing, fixing the "offered
-- under every industry that was not Home" bug for two industries. Garments
-- is the third industry that bug warned about, and it arrived with nothing
-- parented to it at all — choosing Industry: Garments on a new record left
-- Product Type showing zero options, not a wrong set of them.
--
-- The seven names below already exist in the system — as Shirts, Tops,
-- Frocks, Kurthi, Skirts, Palazoos, Kurtha on the Product Sub Type list
-- (code garment_type), every one of them with parent_value_id null, i.e.
-- unreachable through any Product Type they could be a sub type of. That is
-- exactly what a Product Type orphaned mid-build looks like. They are not
-- moved — Product Sub Type is a real, separate question this list still
-- answers for Saree and Fabric, and a value belongs to one list — instead
-- the same seven names are added fresh to the product_type list, parented to
-- Garments, so "what kind of garment" has an answer before "what cut of it".
--
-- Confirmed against the 11 Sep investigation, not decided alone: these seven
-- were the actual candidate set found already sitting in Master Lists,
-- unreachable, not an invented list.

INSERT INTO "lookup_value" ("list_id", "code", "label", "sort_order", "parent_value_id", "status")
SELECT
  l."id",
  v."code",
  v."label",
  v."sort_order",
  (SELECT "id" FROM "lookup_value"
   WHERE "list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'industry')
     AND "label" = 'Garments'),
  'active'
FROM "lookup_list" l
CROSS JOIN (VALUES
  ('shirts',   'Shirts',   6),
  ('tops',     'Tops',     7),
  ('frocks',   'Frocks',   8),
  ('kurthi',   'Kurthi',   9),
  ('skirts',   'Skirts',   10),
  ('palazoos', 'Palazoos', 11),
  ('kurtha',   'Kurtha',   12)
) AS v("code", "label", "sort_order")
WHERE l."code" = 'product_type'
ON CONFLICT DO NOTHING;

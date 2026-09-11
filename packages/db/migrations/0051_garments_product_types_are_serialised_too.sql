-- The seven Garments product types 0050 added were missing the one fact
-- every Clothing product type already carries in meta: {"serialised": true}
-- — that a piece of this type gets its own item code and its own per-
-- consignment sellable count, same as a saree or a dupatta. Left unset, a
-- fresh Garments record could not be published: "no honest per-consignment
-- count for it yet" is exactly the refusal a genuinely pooled type earns,
-- and a Frock is not one.

UPDATE "lookup_value" v
SET "meta" = '{"serialised": true}'::jsonb,
    "updated_at" = now()
WHERE v."list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'product_type')
  AND v."code" IN ('shirts', 'tops', 'frocks', 'kurthi', 'skirts', 'palazoos', 'kurtha');

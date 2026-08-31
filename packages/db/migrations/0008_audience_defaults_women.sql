-- Audience Type defaults to Women.
--
-- Every design that carries an audience carries this one — six sarees, a
-- dupatta, a length of fabric. Men and Kids exist because SLK may sell them
-- one day, not because anything is filed under them today, so making someone
-- pick the only answer on every new record is work the default should do.
--
-- The seed marks it too, for a database created from scratch. The seed never
-- overwrites an existing row, so an established database can only be moved
-- from here.

UPDATE "lookup_value"
SET "is_default" = true,
    "updated_at" = now()
WHERE "label" = 'Women'
  AND "status" = 'active'
  AND "list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'audience_type')
  -- A list already carrying a default has had the decision made on it
  -- deliberately; the partial unique index would refuse a second anyway.
  AND NOT EXISTS (
    SELECT 1 FROM "lookup_value" d
    WHERE d."list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'audience_type')
      AND d."is_default"
  );--> statement-breakpoint

UPDATE "lookup_list"
SET "description" = 'Who the piece is for. Defaults to Women.',
    "updated_at" = now()
WHERE "code" = 'audience_type';

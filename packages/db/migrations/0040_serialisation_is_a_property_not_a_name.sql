-- Whether a product is tracked piece by piece was decided by comparing a label
-- to the string "Saree".
--
--   is_serialised = (productType === "Saree")
--
-- The label is editable. Master Lists lets anyone rename a category, and
-- renaming updates `label` and leaves `code` alone — so "Saree" becoming
-- "Sarees", or "Saree (Handloom)", or a corrected spelling, would have made
-- every design created afterwards silently pooled. No pieces minted, no item
-- codes, no QR labels, and nothing on any screen to say why. The Shopify work
-- rests on per-batch stock, which is derived from pieces, so this had to stop
-- being a string before anything else leans on it.
--
-- Serialisation is a property of the product type, so it is recorded on the
-- product type. `meta` is already where per-value facts live — a colour keeps
-- its hex there, a motif category its two-letter abbreviation — and reading
-- one more key is the pattern this codebase already has.
--
-- It is also the answer to a question that is coming. Dupatta, Fabric,
-- Bedsheets, Scarves and Stolls are pooled today and cannot be listed per
-- consignment until they are tagged one by one. When SLK decides to serialise
-- dupattas, that is this statement with a different code in it, not a deploy.

UPDATE "lookup_value"
SET "meta" = "meta" || '{"serialised": true}'::jsonb,
    "updated_at" = now()
WHERE "code" = 'saree'
  AND "list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'product_type');--> statement-breakpoint

COMMENT ON COLUMN "lookup_value"."meta" IS
  'Per-value facts the application reads: a colour''s hex, a motif category''s abbr, a product type''s serialised flag. Not free-form notes — description is for those.';--> statement-breakpoint

-- Said out loud on the screen, because a product type that mints item codes
-- behaves visibly differently from one that does not, and the person renaming
-- it should be able to see that it is carrying something.
UPDATE "lookup_value"
SET "description" = 'Tracked piece by piece — each saree gets its own item code and QR label.',
    "updated_at" = now()
WHERE "code" = 'saree'
  AND "list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'product_type')
  AND ("description" IS NULL OR "description" = '');

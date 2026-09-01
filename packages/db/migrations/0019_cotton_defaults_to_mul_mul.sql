-- A cotton is a Mul Mul until someone says otherwise.
--
-- Textile Material is narrowed by fibre, so its default has to be narrowed
-- the same way: Mul Mul is the right first answer for a cotton and a wrong
-- one for a silk, which never offers it at all.
--
-- No new column for that. The list-level default already exists and there is
-- exactly one per list; the form applies it only when the chosen fibre
-- actually offers the value. Mul Mul belongs to Cotton, so choosing Cotton
-- lands on it and choosing Silk lands on nothing — which is correct, because
-- there is no obvious first silk among twenty-three.

UPDATE "lookup_value" v
SET "is_default" = false, "updated_at" = now()
FROM "lookup_list" l
WHERE l."id" = v."list_id"
  AND l."code" = 'textile_material'
  AND v."is_default";--> statement-breakpoint

UPDATE "lookup_value" v
SET "is_default" = true, "updated_at" = now()
FROM "lookup_list" l
WHERE l."id" = v."list_id"
  AND l."code" = 'textile_material'
  AND v."label" = 'Mul Mul'
  AND v."status" = 'active';

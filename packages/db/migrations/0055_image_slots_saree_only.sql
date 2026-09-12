-- Body, Pallu, Border and Blouse were seeded as one flat, unparented list —
-- the seed file's own comment says so plainly: "add more and they are
-- offered on every record." That was fine while every serialised product
-- type was a saree in practice; it stopped being fine the moment Garments
-- (0054) became a real Product Type, and a Frock's Images tab started
-- offering a Pallu, a Border and a Blouse shot it has none of. Flagged
-- live: a Frock record showed all four slots, same as a Saree.
--
-- Body is the one shot every product type genuinely wants regardless of
-- what it is, so it stays unparented — universal is the right answer for
-- it, not a bug. Pallu, Border and Blouse describe parts of a saree
-- specifically (confirmed against this app's own Craft & Design tab, where
-- Border/Pallu/Blouse are already asked only when isSaree), so they are
-- reparented to the Saree product type, the same relationship a Product
-- Sub Type already has to its Product Type.
--
-- The editor's own image-slot filter (record-editor.tsx) already reads
-- parent_value_id generically — `o.parentId === null || o.parentId ===
-- productType` — so this is a data fix only, no code change needed.

update "lookup_value"
set "parent_value_id" = (
  select "id" from "lookup_value"
  where "list_id" = (select "id" from "lookup_list" where "code" = 'product_type')
    and "code" = 'saree'
)
where "list_id" = (select "id" from "lookup_list" where "code" = 'image_slot')
  and "code" in ('pallu', 'border', 'blouse');

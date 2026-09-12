-- Garments was asked for as a Product Type — "create a new product type
-- called garments and create the frock" — and 0050 built it as a third
-- industry instead, with Shirts/Tops/Frocks/Kurthi/Skirts/Palazoos/Kurtha
-- as seven stand-in product types under it. That was not what was asked
-- for, and it duplicated a shape that already existed: the Product Sub
-- Type list (code garment_type) already carries all seven of those same
-- names, unparented, sitting exactly where a sub-type of one "Garments"
-- product type belongs — the same relationship Saree's own sub-types
-- (With Blouse / Without Blouse) already have to Saree.
--
-- This migration undoes 0050's shape and builds the one actually asked
-- for: "Garments" becomes a Product Type under Clothing, sort-ordered
-- after Stolls; the seven existing, previously-orphaned Product Sub Type
-- values are reparented under it instead of duplicated; the seven stand-in
-- product types and the Garments industry itself are retired, not
-- deleted — the same convention every other superseded lookup value in
-- this system follows, so a design created under the old shape (0009,
-- Frocks) still resolves to a real, if inactive, row rather than a dangling
-- reference.
--
-- The one design that was created under the wrong shape (FRO-GEN-COT-0009,
-- product code 300009) is moved to the corrected one in the same
-- migration: Clothing industry, the new Garments product type, and its
-- Product Sub Type set to the reparented Frocks value. Its design code is
-- not touched — see record-editor.tsx's own comment that a design code
-- names the recipe and does not change when attributes do.

-- 1. Garments, as a Product Type under Clothing — serialised, the same as
--    every other Clothing product type (Saree, Dupatta, Fabric, Bedsheets,
--    Scarves, Stolls all carry meta.serialised = true already).
insert into "lookup_value" ("list_id", "code", "label", "sort_order", "parent_value_id", "meta", "status")
select
  l."id",
  'garments',
  'Garments',
  6,
  (select "id" from "lookup_value" where "list_id" = (select "id" from "lookup_list" where "code" = 'industry') and "label" = 'Clothing'),
  '{"serialised": true}'::jsonb,
  'active'
from "lookup_list" l
where l."code" = 'product_type'
on conflict do nothing;
--> statement-breakpoint

-- 2. The seven existing Product Sub Type values become sub-types of the
--    new Garments product type — reparented, not recreated. Matched by
--    code and an unparented state, so this only ever touches the rows
--    0050's own comment identified as "orphaned mid-build."
update "lookup_value"
set "parent_value_id" = (
  select "id" from "lookup_value"
  where "list_id" = (select "id" from "lookup_list" where "code" = 'product_type')
    and "code" = 'garments'
)
where "list_id" = (select "id" from "lookup_list" where "code" = 'garment_type')
  and "code" in ('shirts', 'tops', 'frocks', 'kurthi', 'skirts', 'palazoos', 'kurtha')
  and "parent_value_id" is null;
--> statement-breakpoint

-- 3. The seven stand-in product types 0050 created are retired, not
--    deleted — a design pointing at one of them (there is exactly one:
--    0009, moved below) still resolves to a real row; a fresh record can
--    no longer choose one, since loadOptions only offers active values.
update "lookup_value"
set "status" = 'retired'
where "list_id" = (select "id" from "lookup_list" where "code" = 'product_type')
  and "parent_value_id" = (
    select "id" from "lookup_value"
    where "list_id" = (select "id" from "lookup_list" where "code" = 'industry')
      and "label" = 'Garments'
  );
--> statement-breakpoint

-- 4. The Garments industry itself is retired the same way — it was never
--    the thing asked for, and no design should be filed under it going
--    forward.
update "lookup_value"
set "status" = 'retired'
where "list_id" = (select "id" from "lookup_list" where "code" = 'industry')
  and "label" = 'Garments';
--> statement-breakpoint

-- 5. The one design created under the old shape moves to the corrected
--    one: Clothing industry, the new Garments product type, Frocks as its
--    Product Sub Type. is_serialised is already true and stays true — the
--    new Garments product type carries the same meta.serialised flag the
--    old stand-in Frocks type did.
update "design"
set
  "industry_id" = (
    select "id" from "lookup_value"
    where "list_id" = (select "id" from "lookup_list" where "code" = 'industry')
      and "label" = 'Clothing'
  ),
  "product_type_id" = (
    select "id" from "lookup_value"
    where "list_id" = (select "id" from "lookup_list" where "code" = 'product_type')
      and "code" = 'garments'
  ),
  "garment_type_id" = (
    select "id" from "lookup_value"
    where "list_id" = (select "id" from "lookup_list" where "code" = 'garment_type')
      and "code" = 'frocks'
  )
where "code" = 'FRO-GEN-COT-0009';

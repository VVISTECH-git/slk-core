-- Call the list what the field calls it.
--
-- Eight lists were named one thing on Master Lists and another on a product
-- record, so the screen that exists to control a dropdown could not be found
-- from the dropdown: looking up "Product Sub Type" turned up nothing, because
-- the list is called Garment Type. "Fibre Type" against "Fiber Type" was the
-- worst of them — two spellings of one word inside one product.
--
-- The field wins, because that is where people spend their time.
--
-- Only `label` moves. `code` is what records, application logic and every
-- migration hold onto, and it is frozen for the same reason a design code is.

UPDATE "lookup_list" SET "label" = 'Product Sub Type',   "updated_at" = now() WHERE "code" = 'garment_type';--> statement-breakpoint
UPDATE "lookup_list" SET "label" = 'Sold By',            "updated_at" = now() WHERE "code" = 'uom';--> statement-breakpoint
UPDATE "lookup_list" SET "label" = 'Weaving Category',   "updated_at" = now() WHERE "code" = 'home_weaving_category';--> statement-breakpoint
UPDATE "lookup_list" SET "label" = 'Audience',           "updated_at" = now() WHERE "code" = 'audience_type';--> statement-breakpoint
UPDATE "lookup_list" SET "label" = 'Fiber Type',         "updated_at" = now() WHERE "code" = 'fibre_type';--> statement-breakpoint
UPDATE "lookup_list" SET "label" = 'Region Style',       "updated_at" = now() WHERE "code" = 'regional_style';--> statement-breakpoint
UPDATE "lookup_list" SET "label" = 'Blouse Availability', "updated_at" = now() WHERE "code" = 'blouse_available';--> statement-breakpoint

-- Home Product Type keeps its name deliberately.
--
-- The field reads "Product Type" because on a Home & Lifestyle record that is
-- what it is — but two lists cannot both be called Product Type on a screen
-- that lists them side by side, and the app refuses a duplicate label anyway.
-- The prefix is what makes it findable there.
UPDATE "lookup_list"
SET "description" = 'Home and Life Style sheet. Shown as Product Type on a Home & Lifestyle record — the prefix is here so the two product type lists can be told apart.',
    "updated_at" = now()
WHERE "code" = 'home_product_type';--> statement-breakpoint

-- Product Sub Type applies to garments and nothing else.
--
-- It was offered on every Clothing record, which is why a saree showed a dash
-- in it for ever: Kurthi and Blouse are garment types and a saree is not a
-- garment. Parenting each value to the product type it belongs under lets the
-- form ask the question only where it has an answer — the same mechanism
-- Motif already uses with Motif Category.
--
-- Nothing is parented yet, because no product type in the list is a garment.
-- Until one exists the field is hidden, which is the correct answer to "does
-- this saree have a sub type".
UPDATE "lookup_list"
SET "description" = 'Garments sheet. Offered only on product types that have sub types — set a value''s parent to the product type it belongs under, and it appears there.',
    "updated_at" = now()
WHERE "code" = 'garment_type';

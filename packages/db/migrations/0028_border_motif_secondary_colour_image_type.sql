-- Border Motif, a second colour, and image types that follow the product.
--
-- 1 · Border Motif joins the other four. A motif is a motif wherever on the
--     cloth it sits, so it reads the Motif list like body, pallu and blouse.
--
-- 2 · A piece has a primary colour and often a second one — a contrast pallu,
--     a border in another shade. The existing colour becomes the primary, so
--     nothing moves and no record is reinterpreted; the second is new and
--     empty everywhere.
--
--     On the colourway rather than the design, because colour is what makes
--     one colourway different from another under the same design. A design in
--     red-and-gold and the same design in blue-and-silver are two rows, and
--     both halves of that belong on the row.
--
-- 3 · Which photographs a product needs depends on what the product is: a
--     saree is judged on Body, Pallu, Border and Blouse, and a bedsheet is
--     not. Image Slot becomes a dependent classification so a slot can name
--     the product type it belongs to. A slot that names none is offered on
--     every product type, which is what the four existing ones do.

ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "border_motif_id" uuid
  REFERENCES "lookup_value"("id") ON DELETE RESTRICT;--> statement-breakpoint

ALTER TABLE "colourway" ADD COLUMN IF NOT EXISTS "secondary_colour_id" uuid
  REFERENCES "lookup_value"("id") ON DELETE RESTRICT;--> statement-breakpoint

COMMENT ON COLUMN "colourway"."colour_id" IS
  'The primary colour. Together with the design it identifies the colourway.';--> statement-breakpoint

COMMENT ON COLUMN "colourway"."secondary_colour_id" IS
  'The second colour, where there is one — a contrast pallu, a border in another shade. Not part of the identity.';--> statement-breakpoint

UPDATE "lookup_list"
SET "parent_list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'product_type'),
    "description" = 'The kinds of photograph a product needs. A slot can name the product type it belongs to; one that names none is offered on every product.',
    "updated_at" = now()
WHERE "code" = 'image_slot';

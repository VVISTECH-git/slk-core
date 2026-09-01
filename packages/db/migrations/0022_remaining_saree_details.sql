-- The rest of the Additional Product Details fields.
--
-- Nothing new is invented here. Every one of these draws on vocabulary that
-- already exists, because the questions are about where a thing appears
-- rather than what kinds of thing there are: a motif on the blouse is a motif
-- from the same list as a motif on the body, and a blouse's border has the
-- same styles a saree's border has.
--
--   Border Style      the retired list, switched back on — it was retired for
--                     overlapping Border Height, which it does not: one is
--                     how wide, the other is what kind
--   Pallu Motif       Pallu Design renamed, which is the name in use
--   Saree Body Motif  Motif
--   Blouse Motif      Motif
--   Blouse Border     Border Style
--
-- Colour is deliberately absent. Saree Colour, Blouse Colour and Border
-- Colour wait on a decision about the colour list itself.

UPDATE "lookup_list"
SET "is_enabled" = true,
    "status" = 'active',
    "description" = 'What kind of border it is — Khaddi, Zari, Gap, Temple. Not how wide it is; that is Border Height.',
    "updated_at" = now()
WHERE "code" = 'border_style';--> statement-breakpoint

UPDATE "lookup_value"
SET "status" = 'active', "updated_at" = now()
WHERE "list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'border_style')
  AND "status" = 'retired';--> statement-breakpoint

-- Pallu Design has been Pallu Motif everywhere but here.
UPDATE "lookup_list"
SET "label" = 'Pallu Motif',
    "description" = 'How the pallu is finished — plain, zari, contrast, woven motif, or the same as the border.',
    "updated_at" = now()
WHERE "code" = 'pallu_design';--> statement-breakpoint

ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "saree_body_motif_id" uuid
  REFERENCES "lookup_value"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "blouse_motif_id" uuid
  REFERENCES "lookup_value"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "blouse_border_id" uuid
  REFERENCES "lookup_value"("id") ON DELETE RESTRICT;

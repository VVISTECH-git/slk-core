-- The content schema behind the PIM extension: identity/sourcing and
-- technique/appearance detail on design, Sales Story and Care on colourway,
-- craft trust claims as their own set, plus the twenty new Master Lists all
-- of that draws on.
--
-- One migration for all of it, on purpose — see the plan this follows: the
-- expensive, risky surface is the RecordDraft -> validate -> save -> load ->
-- RecordDetail pipeline, and re-threading that once per new field group is
-- how a field gets silently half-wired. Schema once, UI in slices after.
--
-- The twenty lists below are seeded with a small, honest starting
-- vocabulary, not a finished taxonomy — Collection and Supplier are left
-- empty on purpose, since neither has an obvious default and both grow from
-- what staff actually type on Master Lists. Nothing here is exhaustive; a
-- list with too few values today is the same one-click fix any other Master
-- List value has always been.

-- 1 · New lookup lists.
INSERT INTO "lookup_list" ("code", "label", "description", "is_enabled", "status")
VALUES
  ('brand', 'Brand', 'Who a listing trades under, when it is not the channel''s own default vendor.', true, 'active'),
  ('collection', 'Collection', 'A named grouping of designs — a festive edit, a named series.', true, 'active'),
  ('supplier', 'Supplier', 'Who a design was sourced from, for internal reference.', true, 'active'),
  ('country', 'Country of Origin', NULL, true, 'active'),
  ('print_technique', 'Print Technique', 'How the pattern was applied to the cloth, beyond the craft technique itself.', true, 'active'),
  ('dye_technique', 'Dye Technique', 'How the cloth was coloured.', true, 'active'),
  ('embroidery_technique', 'Embroidery Technique', NULL, true, 'active'),
  ('artisan_cluster', 'Artisan / Cluster', 'The weaving or printing cluster a piece is from, narrower than Craft Region.', true, 'active'),
  ('pattern', 'Pattern', NULL, true, 'active'),
  ('texture', 'Texture', NULL, true, 'active'),
  ('finish', 'Finish', NULL, true, 'active'),
  ('transparency', 'Transparency', 'Promoted from free text in design.extra once this list existed.', true, 'active'),
  ('bed_size', 'Bed Size', 'Asked only on Bedsheets.', true, 'active'),
  ('age_group', 'Age Group', 'Asked only on a Kids garment.', true, 'active'),
  ('sleeve_type', 'Sleeve Type', 'Asked only on a garment.', true, 'active'),
  ('closure_type', 'Closure Type', 'Asked only on a garment.', true, 'active'),
  ('fit_type', 'Fit Type', 'Asked only on a garment.', true, 'active'),
  ('fringe_type', 'Fringe Type', 'Asked only on a Scarf or Stole.', true, 'active'),
  ('styling_type', 'Styling Type', 'Asked only on a Scarf or Stole.', true, 'active'),
  ('tax_category', 'Tax Category', 'GST rate lives in this value''s own meta, the same place colour keeps its hex.', true, 'active'),
  ('craft_claim', 'Craft Claim', 'A trust claim a listing makes about how it was made — Handmade, Natural Dyed, and the rest. A design can carry more than one.', true, 'active')
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint

-- Artisan / Cluster narrows Craft Region, the same shape Motif narrows
-- Motif Category.
UPDATE "lookup_list"
SET "parent_list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'regional_style')
WHERE "code" = 'artisan_cluster';--> statement-breakpoint

-- 2 · Seed values. Not exhaustive — see the migration's own top comment.
INSERT INTO "lookup_value" ("list_id", "code", "label", "sort_order", "status")
SELECT (SELECT "id" FROM "lookup_list" WHERE "code" = list_code), v_code, v_label, v_sort, 'active'
FROM (VALUES
  ('brand', 'sree_lakshmi_kalamkari', 'Sree Lakshmi Kalamkari', 0),
  ('brand', 'aartisanz', 'Aartisanz', 1),

  ('country', 'india', 'India', 0),

  ('print_technique', 'hand_block', 'Hand Block', 0),
  ('print_technique', 'screen_print', 'Screen Print', 1),
  ('print_technique', 'digital_print', 'Digital Print', 2),
  ('print_technique', 'discharge_print', 'Discharge Print', 3),

  ('dye_technique', 'natural_dye', 'Natural Dye', 0),
  ('dye_technique', 'vegetable_dye', 'Vegetable Dye', 1),
  ('dye_technique', 'reactive_dye', 'Reactive Dye', 2),
  ('dye_technique', 'azo_free_dye', 'Azo-free Dye', 3),

  ('embroidery_technique', 'hand_embroidery', 'Hand Embroidery', 0),
  ('embroidery_technique', 'machine_embroidery', 'Machine Embroidery', 1),
  ('embroidery_technique', 'mirror_work', 'Mirror Work', 2),
  ('embroidery_technique', 'thread_work', 'Thread Work', 3),

  ('pattern', 'plain', 'Plain', 0),
  ('pattern', 'striped', 'Striped', 1),
  ('pattern', 'checked', 'Checked', 2),
  ('pattern', 'floral', 'Floral', 3),
  ('pattern', 'geometric', 'Geometric', 4),
  ('pattern', 'abstract', 'Abstract', 5),

  ('texture', 'smooth', 'Smooth', 0),
  ('texture', 'textured', 'Textured', 1),
  ('texture', 'crinkled', 'Crinkled', 2),
  ('texture', 'ribbed', 'Ribbed', 3),

  ('finish', 'matte', 'Matte', 0),
  ('finish', 'glossy', 'Glossy', 1),
  ('finish', 'starched', 'Starched', 2),
  ('finish', 'soft_finish', 'Soft Finish', 3),

  ('transparency', 'opaque', 'Opaque', 0),
  ('transparency', 'semi_sheer', 'Semi-Sheer', 1),
  ('transparency', 'sheer', 'Sheer', 2),

  ('bed_size', 'single', 'Single', 0),
  ('bed_size', 'double', 'Double', 1),
  ('bed_size', 'queen', 'Queen', 2),
  ('bed_size', 'king', 'King', 3),

  ('age_group', '0_1_years', '0-1 Years', 0),
  ('age_group', '1_2_years', '1-2 Years', 1),
  ('age_group', '2_3_years', '2-3 Years', 2),
  ('age_group', '3_4_years', '3-4 Years', 3),
  ('age_group', '4_6_years', '4-6 Years', 4),
  ('age_group', '6_8_years', '6-8 Years', 5),
  ('age_group', '8_10_years', '8-10 Years', 6),
  ('age_group', '10_12_years', '10-12 Years', 7),

  ('sleeve_type', 'sleeveless', 'Sleeveless', 0),
  ('sleeve_type', 'short_sleeve', 'Short Sleeve', 1),
  ('sleeve_type', 'three_quarter_sleeve', 'Three-Quarter Sleeve', 2),
  ('sleeve_type', 'full_sleeve', 'Full Sleeve', 3),
  ('sleeve_type', 'puffed_sleeve', 'Puffed Sleeve', 4),

  ('closure_type', 'zipper', 'Zipper', 0),
  ('closure_type', 'button', 'Button', 1),
  ('closure_type', 'hook_and_eye', 'Hook and Eye', 2),
  ('closure_type', 'tie_up', 'Tie-Up', 3),
  ('closure_type', 'pull_on', 'Pull-On', 4),

  ('fit_type', 'regular_fit', 'Regular Fit', 0),
  ('fit_type', 'slim_fit', 'Slim Fit', 1),
  ('fit_type', 'loose_fit', 'Loose Fit', 2),
  ('fit_type', 'a_line', 'A-Line', 3),

  ('fringe_type', 'no_fringe', 'No Fringe', 0),
  ('fringe_type', 'knotted_fringe', 'Knotted Fringe', 1),
  ('fringe_type', 'tassels', 'Tassels', 2),
  ('fringe_type', 'pom_pom', 'Pom-Pom', 3),

  ('styling_type', 'neck_scarf', 'Neck Scarf', 0),
  ('styling_type', 'headscarf', 'Headscarf', 1),
  ('styling_type', 'shoulder_wrap', 'Shoulder Wrap', 2),
  ('styling_type', 'stole', 'Stole', 3),

  ('craft_claim', 'handmade', 'Handmade', 0),
  ('craft_claim', 'handloom', 'Handloom', 1),
  ('craft_claim', 'hand_block_printed', 'Hand Block Printed', 2),
  ('craft_claim', 'natural_dyed', 'Natural Dyed', 3),
  ('craft_claim', 'artisan_made', 'Artisan Made', 4),
  ('craft_claim', 'hand_embroidered', 'Hand Embroidered', 5),
  ('craft_claim', 'minor_variations_expected', 'Minor Handmade Variations Expected', 6)
) AS v(list_code, v_code, v_label, v_sort)
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- Tax Category carries its GST rate in meta, the same place colour keeps its hex.
INSERT INTO "lookup_value" ("list_id", "code", "label", "sort_order", "status", "meta")
SELECT (SELECT "id" FROM "lookup_list" WHERE "code" = 'tax_category'), v_code, v_label, v_sort, 'active', v_meta::jsonb
FROM (VALUES
  ('gst_5', 'GST 5%', 0, '{"ratePercent": 5}'),
  ('gst_12', 'GST 12%', 1, '{"ratePercent": 12}'),
  ('gst_18', 'GST 18%', 2, '{"ratePercent": 18}')
) AS v(v_code, v_label, v_sort, v_meta)
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- 3 · New columns on design — identity/sourcing, technique/appearance,
-- category classifications, tax, and SEO/Shopify identity.
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "short_name" text;--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "brand_id" uuid REFERENCES "lookup_value"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "collection_id" uuid REFERENCES "lookup_value"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "supplier_id" uuid REFERENCES "lookup_value"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "source_url" text;--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "source_sku" text;--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "source_attributes" jsonb NOT NULL DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "country_of_origin_id" uuid REFERENCES "lookup_value"("id") ON DELETE RESTRICT;--> statement-breakpoint

ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "print_technique_id" uuid REFERENCES "lookup_value"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "dye_technique_id" uuid REFERENCES "lookup_value"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "embroidery_technique_id" uuid REFERENCES "lookup_value"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "artisan_cluster_id" uuid REFERENCES "lookup_value"("id") ON DELETE RESTRICT;--> statement-breakpoint

ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "pattern_id" uuid REFERENCES "lookup_value"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "texture_id" uuid REFERENCES "lookup_value"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "finish_id" uuid REFERENCES "lookup_value"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "transparency_id" uuid REFERENCES "lookup_value"("id") ON DELETE RESTRICT;--> statement-breakpoint

ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "bed_size_id" uuid REFERENCES "lookup_value"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "age_group_id" uuid REFERENCES "lookup_value"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "sleeve_type_id" uuid REFERENCES "lookup_value"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "closure_type_id" uuid REFERENCES "lookup_value"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "fit_type_id" uuid REFERENCES "lookup_value"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "fringe_type_id" uuid REFERENCES "lookup_value"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "styling_type_id" uuid REFERENCES "lookup_value"("id") ON DELETE RESTRICT;--> statement-breakpoint

ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "tax_category_id" uuid REFERENCES "lookup_value"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "hsn_code" text;--> statement-breakpoint

ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "seo_title" text;--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "seo_description" text;--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "handle_base" text;--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "extra_tags" jsonb NOT NULL DEFAULT '[]';--> statement-breakpoint

COMMENT ON COLUMN "design"."extra" IS 'Category-specific facts with no column of their own yet. The rule going forward: filterable or reportable, a lookup column; a pure measurement, extra.';--> statement-breakpoint

-- 4 · design_claim — the trust-claim set, same shape as design_descriptor.
CREATE TABLE IF NOT EXISTS "design_claim" (
  "design_id" uuid NOT NULL REFERENCES "design"("id") ON DELETE CASCADE,
  "claim_id" uuid NOT NULL REFERENCES "lookup_value"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("design_id", "claim_id")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "design_claim_value_idx" ON "design_claim" ("claim_id");--> statement-breakpoint

-- 5 · colourway_story and colourway_care — one row per colourway, created
-- lazily by the app the first time either tab is saved, not backfilled here.
CREATE TABLE IF NOT EXISTS "colourway_story" (
  "colourway_id" uuid PRIMARY KEY REFERENCES "colourway"("id") ON DELETE CASCADE,
  "q_special" text,
  "q_feel" text,
  "q_occasions" text,
  "q_recommend_to" text,
  "q_styling" text,
  "q_included" text,
  "q_before_buying" text,
  "q_why_buy" text,
  "short_description" text,
  "full_description" text,
  "why_love" text,
  "craft_story" text,
  "styling_suggestions" text,
  "product_details" text,
  "customer_notes" text,
  "generated_at" timestamptz,
  "generated_fingerprint" text,
  "edited_by_id" uuid REFERENCES "actor"("id") ON DELETE RESTRICT,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "colourway_care" (
  "colourway_id" uuid PRIMARY KEY REFERENCES "colourway"("id") ON DELETE CASCADE,
  "wash_method_id" uuid REFERENCES "lookup_value"("id") ON DELETE RESTRICT,
  "water_temp_id" uuid REFERENCES "lookup_value"("id") ON DELETE RESTRICT,
  "detergent_id" uuid REFERENCES "lookup_value"("id") ON DELETE RESTRICT,
  "drying_id" uuid REFERENCES "lookup_value"("id") ON DELETE RESTRICT,
  "ironing_id" uuid REFERENCES "lookup_value"("id") ON DELETE RESTRICT,
  "dry_clean_required" boolean NOT NULL DEFAULT false,
  "colour_bleed_warning" boolean NOT NULL DEFAULT false,
  "shrinkage_warning" boolean NOT NULL DEFAULT false,
  "storage_note" text,
  "special_notes" text,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

-- Wash Method / Water Temperature / Detergent / Drying / Ironing — the five
-- lookup-backed Care fields. Listed together since they only ever appear on
-- the one new Care tab.
INSERT INTO "lookup_list" ("code", "label", "description", "is_enabled", "status")
VALUES
  ('wash_method', 'Wash Method', NULL, true, 'active'),
  ('water_temp', 'Water Temperature', NULL, true, 'active'),
  ('detergent', 'Detergent', NULL, true, 'active'),
  ('drying', 'Drying', NULL, true, 'active'),
  ('ironing', 'Ironing', NULL, true, 'active')
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint

INSERT INTO "lookup_value" ("list_id", "code", "label", "sort_order", "status")
SELECT (SELECT "id" FROM "lookup_list" WHERE "code" = list_code), v_code, v_label, v_sort, 'active'
FROM (VALUES
  ('wash_method', 'hand_wash', 'Hand Wash', 0),
  ('wash_method', 'machine_wash_gentle', 'Machine Wash (Gentle)', 1),
  ('wash_method', 'dry_clean_only', 'Dry Clean Only', 2),

  ('water_temp', 'cold', 'Cold', 0),
  ('water_temp', 'lukewarm', 'Lukewarm', 1),
  ('water_temp', 'do_not_use_hot_water', 'Do Not Use Hot Water', 2),

  ('detergent', 'mild_liquid_detergent', 'Mild Liquid Detergent', 0),
  ('detergent', 'any_detergent', 'Any Detergent', 1),

  ('drying', 'dry_in_shade', 'Dry in Shade', 0),
  ('drying', 'line_dry', 'Line Dry', 1),
  ('drying', 'do_not_tumble_dry', 'Do Not Tumble Dry', 2),

  ('ironing', 'low_heat', 'Low Heat', 0),
  ('ironing', 'medium_heat', 'Medium Heat', 1),
  ('ironing', 'do_not_iron_on_print', 'Do Not Iron Directly on Print', 2),
  ('ironing', 'steam_only', 'Steam Only', 3)
) AS v(list_code, v_code, v_label, v_sort)
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- 6 · New columns on batch — barcode and package dimensions.
ALTER TABLE "batch" ADD COLUMN IF NOT EXISTS "barcode" text;--> statement-breakpoint
ALTER TABLE "batch" ADD COLUMN IF NOT EXISTS "package_length_cm" numeric(6,1);--> statement-breakpoint
ALTER TABLE "batch" ADD COLUMN IF NOT EXISTS "package_width_cm" numeric(6,1);--> statement-breakpoint
ALTER TABLE "batch" ADD COLUMN IF NOT EXISTS "package_height_cm" numeric(6,1);--> statement-breakpoint

-- 7 · New columns on image — primary flag and source note. (colourway's
-- taxable/tracked/continue-selling columns already landed in 0052.)
ALTER TABLE "image" ADD COLUMN IF NOT EXISTS "is_primary" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "image" ADD COLUMN IF NOT EXISTS "source_note" text;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "image_one_primary_per_colourway"
  ON "image" ("colourway_id") WHERE "is_primary";

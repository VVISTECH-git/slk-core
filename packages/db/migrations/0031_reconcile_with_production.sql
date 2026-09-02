-- The two databases, made to agree.
--
-- The live vocabulary has been edited on the live screen for weeks and the
-- repo never heard about it, so migrations kept finding rows that were not
-- there. This reads the differences off production and states them, choosing
-- the correct state where the two disagree rather than copying either.
--
-- Every statement is idempotent and safe on both, because which database is
-- ahead varies by list.

-- ── Industry ──────────────────────────────────────────────────────────────
--
-- Production calls it Home, not Home & Lifestyle, and has a third: Garments.
-- The label matters more than it should — see HOME_INDUSTRY in the app, which
-- matched on the words and so never matched on production at all.

UPDATE "lookup_value"
SET "label" = 'Home', "updated_at" = now()
WHERE "list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'industry')
  AND "label" = 'Home & Lifestyle';--> statement-breakpoint

INSERT INTO "lookup_value" ("list_id", "code", "label", "sort_order", "status")
SELECT
  (SELECT "id" FROM "lookup_list" WHERE "code" = 'industry'),
  'garments', 'Garments', 2, 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM "lookup_value"
  WHERE "list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'industry')
    AND lower("label") = 'garments'
)
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- ── Product Sub Type ──────────────────────────────────────────────────────
--
-- 0021 moved the five saree layouts out of here and into Saree Style. On
-- production they were not parented to Saree, so the move matched nothing and
-- left them behind — the list now holds them twice over, once here and once
-- in Saree Style where 0027 stated them.
--
-- Retired rather than deleted, and only where a copy is genuinely in Saree
-- Style, so nothing is withdrawn that has nowhere else to be. They are
-- invisible on the form either way: the field narrows to the chosen product
-- type and these name none.

UPDATE "lookup_value" v
SET "status" = 'retired', "updated_at" = now()
WHERE v."list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'garment_type')
  AND v."parent_value_id" IS NULL
  AND v."status" = 'active'
  AND EXISTS (
    SELECT 1 FROM "lookup_value" s
    WHERE s."list_id" = (SELECT "id" FROM "lookup_list" WHERE "code" = 'saree_style')
      AND lower(s."label") = lower(v."label")
  );--> statement-breakpoint

-- ── The empty sheets ──────────────────────────────────────────────────────
--
-- Garment · Size, Home · Width and the rest arrived from the workbook with no
-- values and have never had any. Production switched them off; the repo left
-- them on, so a reader of Master Lists here sees fourteen classifications
-- that can never be answered. Home Product Type goes with them: production
-- retired it, and the Home industry is not being used.

UPDATE "lookup_list"
SET "is_enabled" = false,
    "status" = 'retired',
    "updated_at" = now()
WHERE "code" IN (
  'garment_audience', 'garment_chest', 'garment_collar_type', 'garment_colors',
  'garment_length', 'garment_lining', 'garment_neck_type', 'garment_size',
  'garment_sleeve_length', 'garment_style', 'garment_waist',
  'home_color', 'home_length', 'home_width',
  'home_product_type'
);--> statement-breakpoint

UPDATE "lookup_value"
SET "status" = 'retired', "updated_at" = now()
WHERE "list_id" IN (
  SELECT "id" FROM "lookup_list" WHERE "code" = 'home_product_type'
) AND "status" = 'active';--> statement-breakpoint

-- ── Image Type ────────────────────────────────────────────────────────────
--
-- Created on the live screen — Saree Body, Saree Pallu, Saree Blouse —
-- alongside Image Slot, which already holds Body, Pallu, Border and Blouse
-- and is the one the record editor reads. Two lists for one question.
--
-- Left alone deliberately. Which of the two survives is a decision about the
-- vocabulary, not a difference to paper over, and nothing reads Image Type,
-- so it costs nothing until that is settled. Recorded here so the choice is
-- not made by accident.
UPDATE "lookup_list"
SET "description" = 'Overlaps Image Slot, which is the list the record editor reads. One of the two should go — see migration 0031.',
    "updated_at" = now()
WHERE "code" = 'image_type';

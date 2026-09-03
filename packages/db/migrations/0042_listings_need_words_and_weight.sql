-- A consignment can carry its own price since 0041 and still cannot say what
-- it is. Every field a Shopify listing needs beyond a photograph and a price
-- was missing: something to call it, something to say about it, what it
-- weighs, what it is invoiced under.
--
-- All four are nullable and all four compose when they are null. A title
-- builds from the design and its colour; a description from the taxonomy —
-- craft technique, motif, border, fibre — that every record already carries;
-- weight and HSN have no honest default and stay blank until entered. Nothing
-- here is backfilled, and every existing consignment behaves exactly as it
-- did before this migration.
--
-- The override exists for the one that needs a hand — a festival run, a
-- collaboration — the same shape as price on this table: a column that is
-- usually empty and says something specific when it is not.

ALTER TABLE "batch" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "batch" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "batch" ADD COLUMN "weight_grams" integer;--> statement-breakpoint
ALTER TABLE "batch" ADD COLUMN "hsn_code" text;--> statement-breakpoint

COMMENT ON COLUMN "batch"."title" IS
  'What the storefront calls this consignment. Null composes from the design and its colour.';--> statement-breakpoint
COMMENT ON COLUMN "batch"."description" IS
  'The shopper-facing paragraph. Null composes from the taxonomy. Not note, which is internal.';--> statement-breakpoint

-- A weight is not negative, and 60kg is well past a saree — the check exists
-- to catch a stray decimal point (4500 grams typed as 45000), not to bound
-- what handloom can weigh.
ALTER TABLE "batch" ADD CONSTRAINT "batch_weight_plausible"
  CHECK ("weight_grams" IS NULL OR "weight_grams" BETWEEN 1 AND 60000);--> statement-breakpoint

-- ── Alt text ─────────────────────────────────────────────────────────────
--
-- One `image` row per photograph, and nothing on it says what the photograph
-- shows. Null composes from the product, its colour and the slot — worked out
-- once the consignment can compose a title of its own, in the application
-- rather than here, since it needs the design's name and the slot's label
-- joined together.

ALTER TABLE "image" ADD COLUMN "alt" text;--> statement-breakpoint

COMMENT ON COLUMN "image"."alt" IS
  'What the photograph shows, for a reader who cannot see it. Null composes from the product, colour and slot.';

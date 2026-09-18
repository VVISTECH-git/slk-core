CREATE TABLE IF NOT EXISTS "colourway_care" (
	"colourway_id" uuid PRIMARY KEY NOT NULL,
	"wash_method_id" uuid,
	"water_temp_id" uuid,
	"detergent_id" uuid,
	"drying_id" uuid,
	"ironing_id" uuid,
	"dry_clean_required" boolean DEFAULT false NOT NULL,
	"colour_bleed_warning" boolean DEFAULT false NOT NULL,
	"shrinkage_warning" boolean DEFAULT false NOT NULL,
	"storage_note" text,
	"special_notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "colourway_story" (
	"colourway_id" uuid PRIMARY KEY NOT NULL,
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
	"generated_at" timestamp with time zone,
	"generated_fingerprint" text,
	"edited_by_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "design_claim" (
	"design_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "design_claim_design_id_claim_id_pk" PRIMARY KEY("design_id","claim_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "actor_job_role" (
	"actor_id" uuid NOT NULL,
	"job_role_id" uuid NOT NULL,
	CONSTRAINT "actor_job_role_actor_id_job_role_id_pk" PRIMARY KEY("actor_id","job_role_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "record_review_event" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "record_review_event_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"colourway_id" uuid NOT NULL,
	"actor_id" uuid,
	"from_status" text,
	"to_status" text NOT NULL,
	"comment" text,
	"flagged_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "record_review_event_to_status_known" CHECK ("record_review_event"."to_status" in ('draft', 'submitted', 'needs_changes', 'approved'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bale" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"supplier_id" uuid NOT NULL,
	"transporter" text,
	"invoice_number" text,
	"invoice_date" date,
	"invoice_amount" numeric(12, 2),
	"type" text NOT NULL,
	"metres_received" numeric(10, 2) NOT NULL,
	"uom" text DEFAULT 'Mtrs' NOT NULL,
	"item_id" uuid NOT NULL,
	"grade_code" text,
	"needs_second_print" boolean DEFAULT true NOT NULL,
	"bale_count" integer DEFAULT 1 NOT NULL,
	"notes" text,
	"status" text DEFAULT 'awaiting_cutting' NOT NULL,
	"bill_entry_date" date DEFAULT current_date NOT NULL,
	"recorded_by_id" uuid,
	"cut_by_id" uuid,
	"returned_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bale_status_known" CHECK ("bale"."status" in ('awaiting_cutting', 'cutting_in_progress', 'cut', 'returned')),
	CONSTRAINT "bale_uom_known" CHECK ("bale"."uom" in ('Mtrs', 'Nos')),
	CONSTRAINT "bale_type_known" CHECK ("bale"."type" in ('Sarees', 'Fabric', 'Chunnies', 'Bedsheets', 'Pillows'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bale_cutting_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bale_id" uuid NOT NULL,
	"actor_id" uuid,
	"count" integer NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cloth_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"cloth_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"has_blouse" boolean,
	"border" text,
	"pallu" text,
	"fibre_type_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cloth_item_status_known" CHECK ("cloth_item"."status" in ('active', 'inactive')),
	CONSTRAINT "cloth_item_border_known" CHECK ("cloth_item"."border" is null or "cloth_item"."border" in ('Zari', 'Plain', 'Contrast', 'Tasseled')),
	CONSTRAINT "cloth_item_pallu_known" CHECK ("cloth_item"."pallu" is null or "cloth_item"."pallu" in ('Same as body', 'Contrast'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "handover" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thaan_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"vendor_id" uuid,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_at" timestamp with time zone,
	"notes" text,
	"recorded_by_id" uuid,
	"received_by_id" uuid,
	"vendor_transaction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "handover_stage_known" CHECK ("handover"."stage" in (
        'Label Stitching', 'Salava', 'Karakkaya', 'Print', 'Second Print', 'Nellateeta', 'Udukulu', 'Ironing'
      ))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supplier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"code_prefix" text NOT NULL,
	"phone" text,
	"gstin" text,
	"address" text,
	"contact_person" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_status_known" CHECK ("supplier"."status" in ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "thaan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bale_id" uuid NOT NULL,
	"code" text,
	"qr_generated_at" timestamp with time zone,
	"qr_generated_by_id" uuid,
	"voided_at" timestamp with time zone,
	"voided_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"primary_phone" text,
	"secondary_phone" text,
	"village" text,
	"stages" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor_payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"paid_on" date DEFAULT current_date NOT NULL,
	"method" text,
	"notes" text,
	"recorded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor_rate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_rate_stage_known" CHECK ("vendor_rate"."stage" in (
        'Label Stitching', 'Salava', 'Karakkaya', 'Print', 'Second Print', 'Nellateeta', 'Udukulu', 'Ironing'
      ))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor_transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"piece_count" integer NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"transaction_date" date DEFAULT current_date NOT NULL,
	"notes" text,
	"recorded_by_id" uuid,
	"approved_at" timestamp with time zone,
	"approved_by_id" uuid,
	"paid_at" timestamp with time zone,
	"vendor_payment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_transaction_stage_known" CHECK ("vendor_transaction"."stage" in (
        'Label Stitching', 'Salava', 'Karakkaya', 'Print', 'Second Print', 'Nellateeta', 'Udukulu', 'Ironing'
      ))
);
--> statement-breakpoint
ALTER TABLE "batch" ADD COLUMN IF NOT EXISTS "barcode" text;
--> statement-breakpoint
ALTER TABLE "batch" ADD COLUMN IF NOT EXISTS "package_length_cm" numeric(6, 1);
--> statement-breakpoint
ALTER TABLE "batch" ADD COLUMN IF NOT EXISTS "package_width_cm" numeric(6, 1);
--> statement-breakpoint
ALTER TABLE "batch" ADD COLUMN IF NOT EXISTS "package_height_cm" numeric(6, 1);
--> statement-breakpoint
ALTER TABLE "colourway" ADD COLUMN IF NOT EXISTS "is_taxable" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "colourway" ADD COLUMN IF NOT EXISTS "tracks_inventory" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "colourway" ADD COLUMN IF NOT EXISTS "continue_selling_oos" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "colourway" ADD COLUMN IF NOT EXISTS "review_status" text DEFAULT 'draft' NOT NULL;
--> statement-breakpoint
ALTER TABLE "colourway" ADD COLUMN IF NOT EXISTS "created_by_id" uuid;
--> statement-breakpoint
ALTER TABLE "colourway" ADD COLUMN IF NOT EXISTS "updated_by_id" uuid;
--> statement-breakpoint
ALTER TABLE "colourway" ADD COLUMN IF NOT EXISTS "submitted_by_id" uuid;
--> statement-breakpoint
ALTER TABLE "colourway" ADD COLUMN IF NOT EXISTS "submitted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "colourway" ADD COLUMN IF NOT EXISTS "reviewed_by_id" uuid;
--> statement-breakpoint
ALTER TABLE "colourway" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "short_name" text;
--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "brand_id" uuid;
--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "collection_id" uuid;
--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "supplier_id" uuid;
--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "source_url" text;
--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "source_sku" text;
--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "source_attributes" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "country_of_origin_id" uuid;
--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "print_technique_id" uuid;
--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "dye_technique_id" uuid;
--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "embroidery_technique_id" uuid;
--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "artisan_cluster_id" uuid;
--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "pattern_id" uuid;
--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "texture_id" uuid;
--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "finish_id" uuid;
--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "transparency_id" uuid;
--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "bed_size_id" uuid;
--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "age_group_id" uuid;
--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "sleeve_type_id" uuid;
--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "closure_type_id" uuid;
--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "fit_type_id" uuid;
--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "fringe_type_id" uuid;
--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "styling_type_id" uuid;
--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "tax_category_id" uuid;
--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "hsn_code" text;
--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "seo_title" text;
--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "seo_description" text;
--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "handle_base" text;
--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN IF NOT EXISTS "extra_tags" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "image" ADD COLUMN IF NOT EXISTS "is_primary" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "image" ADD COLUMN IF NOT EXISTS "source_note" text;
--> statement-breakpoint
ALTER TABLE "actor" ADD COLUMN IF NOT EXISTS "preferences" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "channel_link" ADD COLUMN IF NOT EXISTS "shopify_status" text;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "colourway_care" ADD CONSTRAINT "colourway_care_colourway_id_colourway_id_fk" FOREIGN KEY ("colourway_id") REFERENCES "public"."colourway"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "colourway_care" ADD CONSTRAINT "colourway_care_wash_method_id_lookup_value_id_fk" FOREIGN KEY ("wash_method_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "colourway_care" ADD CONSTRAINT "colourway_care_water_temp_id_lookup_value_id_fk" FOREIGN KEY ("water_temp_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "colourway_care" ADD CONSTRAINT "colourway_care_detergent_id_lookup_value_id_fk" FOREIGN KEY ("detergent_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "colourway_care" ADD CONSTRAINT "colourway_care_drying_id_lookup_value_id_fk" FOREIGN KEY ("drying_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "colourway_care" ADD CONSTRAINT "colourway_care_ironing_id_lookup_value_id_fk" FOREIGN KEY ("ironing_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "colourway_story" ADD CONSTRAINT "colourway_story_colourway_id_colourway_id_fk" FOREIGN KEY ("colourway_id") REFERENCES "public"."colourway"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "colourway_story" ADD CONSTRAINT "colourway_story_edited_by_id_actor_id_fk" FOREIGN KEY ("edited_by_id") REFERENCES "public"."actor"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "design_claim" ADD CONSTRAINT "design_claim_design_id_design_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."design"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "design_claim" ADD CONSTRAINT "design_claim_claim_id_lookup_value_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "actor_job_role" ADD CONSTRAINT "actor_job_role_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actor"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "actor_job_role" ADD CONSTRAINT "actor_job_role_job_role_id_job_role_id_fk" FOREIGN KEY ("job_role_id") REFERENCES "public"."job_role"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "record_review_event" ADD CONSTRAINT "record_review_event_colourway_id_colourway_id_fk" FOREIGN KEY ("colourway_id") REFERENCES "public"."colourway"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "record_review_event" ADD CONSTRAINT "record_review_event_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actor"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bale" ADD CONSTRAINT "bale_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bale" ADD CONSTRAINT "bale_item_id_cloth_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."cloth_item"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bale" ADD CONSTRAINT "bale_recorded_by_id_actor_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."actor"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bale" ADD CONSTRAINT "bale_cut_by_id_actor_id_fk" FOREIGN KEY ("cut_by_id") REFERENCES "public"."actor"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bale" ADD CONSTRAINT "bale_returned_by_id_actor_id_fk" FOREIGN KEY ("returned_by_id") REFERENCES "public"."actor"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bale_cutting_event" ADD CONSTRAINT "bale_cutting_event_bale_id_bale_id_fk" FOREIGN KEY ("bale_id") REFERENCES "public"."bale"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bale_cutting_event" ADD CONSTRAINT "bale_cutting_event_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actor"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cloth_item" ADD CONSTRAINT "cloth_item_fibre_type_id_lookup_value_id_fk" FOREIGN KEY ("fibre_type_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "handover" ADD CONSTRAINT "handover_thaan_id_thaan_id_fk" FOREIGN KEY ("thaan_id") REFERENCES "public"."thaan"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "handover" ADD CONSTRAINT "handover_vendor_id_vendor_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "handover" ADD CONSTRAINT "handover_recorded_by_id_actor_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."actor"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "handover" ADD CONSTRAINT "handover_received_by_id_actor_id_fk" FOREIGN KEY ("received_by_id") REFERENCES "public"."actor"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "handover" ADD CONSTRAINT "handover_vendor_transaction_id_vendor_transaction_id_fk" FOREIGN KEY ("vendor_transaction_id") REFERENCES "public"."vendor_transaction"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "thaan" ADD CONSTRAINT "thaan_bale_id_bale_id_fk" FOREIGN KEY ("bale_id") REFERENCES "public"."bale"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "thaan" ADD CONSTRAINT "thaan_qr_generated_by_id_actor_id_fk" FOREIGN KEY ("qr_generated_by_id") REFERENCES "public"."actor"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "thaan" ADD CONSTRAINT "thaan_voided_by_id_actor_id_fk" FOREIGN KEY ("voided_by_id") REFERENCES "public"."actor"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "vendor_payment" ADD CONSTRAINT "vendor_payment_vendor_id_vendor_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "vendor_payment" ADD CONSTRAINT "vendor_payment_recorded_by_id_actor_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."actor"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "vendor_rate" ADD CONSTRAINT "vendor_rate_vendor_id_vendor_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "vendor_transaction" ADD CONSTRAINT "vendor_transaction_vendor_id_vendor_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "vendor_transaction" ADD CONSTRAINT "vendor_transaction_recorded_by_id_actor_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."actor"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "vendor_transaction" ADD CONSTRAINT "vendor_transaction_approved_by_id_actor_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."actor"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "vendor_transaction" ADD CONSTRAINT "vendor_transaction_vendor_payment_id_vendor_payment_id_fk" FOREIGN KEY ("vendor_payment_id") REFERENCES "public"."vendor_payment"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "design_claim_value_idx" ON "design_claim" USING btree ("claim_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "actor_job_role_job_role_idx" ON "actor_job_role" USING btree ("job_role_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "job_role_name_key" ON "job_role" USING btree ("name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "record_review_event_colourway_idx" ON "record_review_event" USING btree ("colourway_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bale_code_key" ON "bale" USING btree ("code");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cloth_item_name_key" ON "cloth_item" USING btree ("name");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cloth_item_code_key" ON "cloth_item" USING btree ("code");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "handover_one_open_per_thaan" ON "handover" USING btree ("thaan_id") WHERE "handover"."received_at" is null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "handover_thaan_id_idx" ON "handover" USING btree ("thaan_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_name_key" ON "supplier" USING btree ("name");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_code_key" ON "supplier" USING btree ("code");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_code_prefix_key" ON "supplier" USING btree ("code_prefix");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "thaan_code_key" ON "thaan" USING btree ("code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "thaan_bale_id_idx" ON "thaan" USING btree ("bale_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vendor_name_key" ON "vendor" USING btree ("name");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vendor_code_key" ON "vendor" USING btree ("code");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vendor_rate_vendor_stage_key" ON "vendor_rate" USING btree ("vendor_id","stage");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "colourway" ADD CONSTRAINT "colourway_created_by_id_actor_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."actor"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "colourway" ADD CONSTRAINT "colourway_updated_by_id_actor_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."actor"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "colourway" ADD CONSTRAINT "colourway_submitted_by_id_actor_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."actor"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "colourway" ADD CONSTRAINT "colourway_reviewed_by_id_actor_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."actor"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "design" ADD CONSTRAINT "design_brand_id_lookup_value_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "design" ADD CONSTRAINT "design_collection_id_lookup_value_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "design" ADD CONSTRAINT "design_supplier_id_lookup_value_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "design" ADD CONSTRAINT "design_country_of_origin_id_lookup_value_id_fk" FOREIGN KEY ("country_of_origin_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "design" ADD CONSTRAINT "design_print_technique_id_lookup_value_id_fk" FOREIGN KEY ("print_technique_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "design" ADD CONSTRAINT "design_dye_technique_id_lookup_value_id_fk" FOREIGN KEY ("dye_technique_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "design" ADD CONSTRAINT "design_embroidery_technique_id_lookup_value_id_fk" FOREIGN KEY ("embroidery_technique_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "design" ADD CONSTRAINT "design_artisan_cluster_id_lookup_value_id_fk" FOREIGN KEY ("artisan_cluster_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "design" ADD CONSTRAINT "design_pattern_id_lookup_value_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "design" ADD CONSTRAINT "design_texture_id_lookup_value_id_fk" FOREIGN KEY ("texture_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "design" ADD CONSTRAINT "design_finish_id_lookup_value_id_fk" FOREIGN KEY ("finish_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "design" ADD CONSTRAINT "design_transparency_id_lookup_value_id_fk" FOREIGN KEY ("transparency_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "design" ADD CONSTRAINT "design_bed_size_id_lookup_value_id_fk" FOREIGN KEY ("bed_size_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "design" ADD CONSTRAINT "design_age_group_id_lookup_value_id_fk" FOREIGN KEY ("age_group_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "design" ADD CONSTRAINT "design_sleeve_type_id_lookup_value_id_fk" FOREIGN KEY ("sleeve_type_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "design" ADD CONSTRAINT "design_closure_type_id_lookup_value_id_fk" FOREIGN KEY ("closure_type_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "design" ADD CONSTRAINT "design_fit_type_id_lookup_value_id_fk" FOREIGN KEY ("fit_type_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "design" ADD CONSTRAINT "design_fringe_type_id_lookup_value_id_fk" FOREIGN KEY ("fringe_type_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "design" ADD CONSTRAINT "design_styling_type_id_lookup_value_id_fk" FOREIGN KEY ("styling_type_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "design" ADD CONSTRAINT "design_tax_category_id_lookup_value_id_fk" FOREIGN KEY ("tax_category_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "colourway_review_status_idx" ON "colourway" USING btree ("review_status","updated_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "image_one_primary_per_colourway" ON "image" USING btree ("colourway_id") WHERE "image"."is_primary";
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "colourway" ADD CONSTRAINT "colourway_review_status_known" CHECK ("colourway"."review_status" in ('draft', 'submitted', 'needs_changes', 'approved'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "channel_link" ADD CONSTRAINT "channel_link_shopify_status_known" CHECK ("channel_link"."shopify_status" is null or "channel_link"."shopify_status" in ('draft', 'active', 'archived'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

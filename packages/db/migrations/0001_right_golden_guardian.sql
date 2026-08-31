CREATE TABLE "colourway" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"design_id" uuid NOT NULL,
	"colour_id" uuid,
	"cost_minor" bigint,
	"making_minor" bigint,
	"wholesale_minor" bigint,
	"retail_minor" bigint,
	"mrp_minor" bigint,
	"currency" text DEFAULT 'INR' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "design" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"seq" integer NOT NULL,
	"name" text NOT NULL,
	"name_is_custom" boolean DEFAULT false NOT NULL,
	"industry_id" uuid,
	"product_type_id" uuid,
	"garment_type_id" uuid,
	"home_product_type_id" uuid,
	"home_weaving_category_id" uuid,
	"production_method_id" uuid,
	"weave_structure_id" uuid,
	"fibre_type_id" uuid,
	"silk_sub_family_id" uuid,
	"cotton_sub_family_id" uuid,
	"fabric_type_id" uuid,
	"audience_type_id" uuid,
	"craft_technique_id" uuid,
	"craft_sub_type_id" uuid,
	"regional_style_id" uuid,
	"motif_category_id" uuid,
	"motif_id" uuid,
	"border_style_id" uuid,
	"border_height_id" uuid,
	"saree_layout_id" uuid,
	"pallu_design_id" uuid,
	"blouse_available_id" uuid,
	"blouse_status_id" uuid,
	"blouse_material_id" uuid,
	"descriptor_id" uuid,
	"uom_id" uuid,
	"is_serialised" boolean DEFAULT false NOT NULL,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "image" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"colourway_id" uuid NOT NULL,
	"slot" text NOT NULL,
	"storage_key" text NOT NULL,
	"width" integer,
	"height" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_internal" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movement" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "movement_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"colourway_id" uuid NOT NULL,
	"piece_id" uuid,
	"qty" integer NOT NULL,
	"kind" text NOT NULL,
	"from_location_id" uuid,
	"to_location_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text,
	"reference" text,
	"note" text,
	"idempotency_key" text
);
--> statement-breakpoint
CREATE TABLE "piece" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"colourway_id" uuid NOT NULL,
	"code" text NOT NULL,
	"serial" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "colourway" ADD CONSTRAINT "colourway_design_id_design_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."design"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colourway" ADD CONSTRAINT "colourway_colour_id_lookup_value_id_fk" FOREIGN KEY ("colour_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design" ADD CONSTRAINT "design_industry_id_lookup_value_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design" ADD CONSTRAINT "design_product_type_id_lookup_value_id_fk" FOREIGN KEY ("product_type_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design" ADD CONSTRAINT "design_garment_type_id_lookup_value_id_fk" FOREIGN KEY ("garment_type_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design" ADD CONSTRAINT "design_home_product_type_id_lookup_value_id_fk" FOREIGN KEY ("home_product_type_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design" ADD CONSTRAINT "design_home_weaving_category_id_lookup_value_id_fk" FOREIGN KEY ("home_weaving_category_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design" ADD CONSTRAINT "design_production_method_id_lookup_value_id_fk" FOREIGN KEY ("production_method_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design" ADD CONSTRAINT "design_weave_structure_id_lookup_value_id_fk" FOREIGN KEY ("weave_structure_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design" ADD CONSTRAINT "design_fibre_type_id_lookup_value_id_fk" FOREIGN KEY ("fibre_type_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design" ADD CONSTRAINT "design_silk_sub_family_id_lookup_value_id_fk" FOREIGN KEY ("silk_sub_family_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design" ADD CONSTRAINT "design_cotton_sub_family_id_lookup_value_id_fk" FOREIGN KEY ("cotton_sub_family_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design" ADD CONSTRAINT "design_fabric_type_id_lookup_value_id_fk" FOREIGN KEY ("fabric_type_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design" ADD CONSTRAINT "design_audience_type_id_lookup_value_id_fk" FOREIGN KEY ("audience_type_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design" ADD CONSTRAINT "design_craft_technique_id_lookup_value_id_fk" FOREIGN KEY ("craft_technique_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design" ADD CONSTRAINT "design_craft_sub_type_id_lookup_value_id_fk" FOREIGN KEY ("craft_sub_type_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design" ADD CONSTRAINT "design_regional_style_id_lookup_value_id_fk" FOREIGN KEY ("regional_style_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design" ADD CONSTRAINT "design_motif_category_id_lookup_value_id_fk" FOREIGN KEY ("motif_category_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design" ADD CONSTRAINT "design_motif_id_lookup_value_id_fk" FOREIGN KEY ("motif_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design" ADD CONSTRAINT "design_border_style_id_lookup_value_id_fk" FOREIGN KEY ("border_style_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design" ADD CONSTRAINT "design_border_height_id_lookup_value_id_fk" FOREIGN KEY ("border_height_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design" ADD CONSTRAINT "design_saree_layout_id_lookup_value_id_fk" FOREIGN KEY ("saree_layout_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design" ADD CONSTRAINT "design_pallu_design_id_lookup_value_id_fk" FOREIGN KEY ("pallu_design_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design" ADD CONSTRAINT "design_blouse_available_id_lookup_value_id_fk" FOREIGN KEY ("blouse_available_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design" ADD CONSTRAINT "design_blouse_status_id_lookup_value_id_fk" FOREIGN KEY ("blouse_status_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design" ADD CONSTRAINT "design_blouse_material_id_lookup_value_id_fk" FOREIGN KEY ("blouse_material_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design" ADD CONSTRAINT "design_descriptor_id_lookup_value_id_fk" FOREIGN KEY ("descriptor_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design" ADD CONSTRAINT "design_uom_id_lookup_value_id_fk" FOREIGN KEY ("uom_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image" ADD CONSTRAINT "image_colourway_id_colourway_id_fk" FOREIGN KEY ("colourway_id") REFERENCES "public"."colourway"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement" ADD CONSTRAINT "movement_colourway_id_colourway_id_fk" FOREIGN KEY ("colourway_id") REFERENCES "public"."colourway"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement" ADD CONSTRAINT "movement_piece_id_piece_id_fk" FOREIGN KEY ("piece_id") REFERENCES "public"."piece"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement" ADD CONSTRAINT "movement_from_location_id_location_id_fk" FOREIGN KEY ("from_location_id") REFERENCES "public"."location"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement" ADD CONSTRAINT "movement_to_location_id_location_id_fk" FOREIGN KEY ("to_location_id") REFERENCES "public"."location"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piece" ADD CONSTRAINT "piece_colourway_id_colourway_id_fk" FOREIGN KEY ("colourway_id") REFERENCES "public"."colourway"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "colourway_design_colour_key" ON "colourway" USING btree ("design_id","colour_id");--> statement-breakpoint
CREATE INDEX "colourway_design_idx" ON "colourway" USING btree ("design_id");--> statement-breakpoint
CREATE UNIQUE INDEX "design_code_key" ON "design" USING btree ("code");--> statement-breakpoint
CREATE INDEX "design_product_type_idx" ON "design" USING btree ("product_type_id");--> statement-breakpoint
CREATE INDEX "design_craft_technique_idx" ON "design" USING btree ("craft_technique_id");--> statement-breakpoint
CREATE INDEX "design_regional_style_idx" ON "design" USING btree ("regional_style_id");--> statement-breakpoint
CREATE UNIQUE INDEX "image_colourway_slot_key" ON "image" USING btree ("colourway_id","slot");--> statement-breakpoint
CREATE INDEX "image_colourway_idx" ON "image" USING btree ("colourway_id");--> statement-breakpoint
CREATE UNIQUE INDEX "location_code_key" ON "location" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "movement_idempotency_key" ON "movement" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "movement_colourway_idx" ON "movement" USING btree ("colourway_id","occurred_at");--> statement-breakpoint
CREATE INDEX "movement_piece_idx" ON "movement" USING btree ("piece_id");--> statement-breakpoint
CREATE UNIQUE INDEX "piece_code_key" ON "piece" USING btree ("code");--> statement-breakpoint
CREATE INDEX "piece_colourway_idx" ON "piece" USING btree ("colourway_id");
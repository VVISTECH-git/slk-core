ALTER TABLE "cloth_item" ADD COLUMN "border_style_id" uuid;--> statement-breakpoint
ALTER TABLE "cloth_item" ADD COLUMN "border_height_id" uuid;--> statement-breakpoint
ALTER TABLE "cloth_item" ADD COLUMN "blouse_style_id" uuid;--> statement-breakpoint
ALTER TABLE "cloth_item" ADD COLUMN "blouse_material_id" uuid;--> statement-breakpoint
ALTER TABLE "cloth_item" ADD COLUMN "weave_structure_id" uuid;--> statement-breakpoint
ALTER TABLE "cloth_item" ADD COLUMN "textile_material_id" uuid;--> statement-breakpoint
ALTER TABLE "cloth_item" ADD COLUMN "production_method_id" uuid;--> statement-breakpoint
ALTER TABLE "cloth_item" ADD COLUMN "audience_id" uuid;--> statement-breakpoint
ALTER TABLE "cloth_item" ADD COLUMN "saree_length_cm" numeric(7, 1);--> statement-breakpoint
ALTER TABLE "cloth_item" ADD COLUMN "saree_width_cm" numeric(7, 1);--> statement-breakpoint
ALTER TABLE "cloth_item" ADD COLUMN "pallu_length_cm" numeric(7, 1);--> statement-breakpoint
ALTER TABLE "cloth_item" ADD COLUMN "blouse_length_cm" numeric(7, 1);--> statement-breakpoint
ALTER TABLE "cloth_item" ADD CONSTRAINT "cloth_item_border_style_id_lookup_value_id_fk" FOREIGN KEY ("border_style_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloth_item" ADD CONSTRAINT "cloth_item_border_height_id_lookup_value_id_fk" FOREIGN KEY ("border_height_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloth_item" ADD CONSTRAINT "cloth_item_blouse_style_id_lookup_value_id_fk" FOREIGN KEY ("blouse_style_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloth_item" ADD CONSTRAINT "cloth_item_blouse_material_id_lookup_value_id_fk" FOREIGN KEY ("blouse_material_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloth_item" ADD CONSTRAINT "cloth_item_weave_structure_id_lookup_value_id_fk" FOREIGN KEY ("weave_structure_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloth_item" ADD CONSTRAINT "cloth_item_textile_material_id_lookup_value_id_fk" FOREIGN KEY ("textile_material_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloth_item" ADD CONSTRAINT "cloth_item_production_method_id_lookup_value_id_fk" FOREIGN KEY ("production_method_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloth_item" ADD CONSTRAINT "cloth_item_audience_id_lookup_value_id_fk" FOREIGN KEY ("audience_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;
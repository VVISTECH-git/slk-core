CREATE TABLE "thaan_damage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thaan_id" uuid NOT NULL,
	"vendor_id" uuid,
	"stage" text,
	"notes" text,
	"flagged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"flagged_by_id" uuid,
	"addressed_at" timestamp with time zone,
	"addressed_by_id" uuid,
	"written_off_at" timestamp with time zone,
	"written_off_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "thaan_damage_stage_known" CHECK ("thaan_damage"."stage" is null or "thaan_damage"."stage" in (
        'Label Stitching', 'Salava', 'Karakkaya', 'Print', 'Second Print', 'Nellateeta', 'Udukulu', 'Ironing'
      ))
);
--> statement-breakpoint
ALTER TABLE "thaan_damage" ADD CONSTRAINT "thaan_damage_thaan_id_thaan_id_fk" FOREIGN KEY ("thaan_id") REFERENCES "public"."thaan"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thaan_damage" ADD CONSTRAINT "thaan_damage_vendor_id_vendor_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thaan_damage" ADD CONSTRAINT "thaan_damage_flagged_by_id_actor_id_fk" FOREIGN KEY ("flagged_by_id") REFERENCES "public"."actor"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thaan_damage" ADD CONSTRAINT "thaan_damage_addressed_by_id_actor_id_fk" FOREIGN KEY ("addressed_by_id") REFERENCES "public"."actor"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thaan_damage" ADD CONSTRAINT "thaan_damage_written_off_by_id_actor_id_fk" FOREIGN KEY ("written_off_by_id") REFERENCES "public"."actor"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "thaan_damage_one_open_per_thaan" ON "thaan_damage" USING btree ("thaan_id") WHERE "thaan_damage"."written_off_at" is null;--> statement-breakpoint
CREATE INDEX "thaan_damage_vendor_id_idx" ON "thaan_damage" USING btree ("vendor_id");
CREATE TABLE "pile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"photo_key" text,
	"main_colour_id" uuid,
	"created_stage" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"colourway_id" uuid,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pile_status_known" CHECK ("pile"."status" in ('draft', 'ready', 'live')),
	CONSTRAINT "pile_created_stage_known" CHECK ("pile"."created_stage" in ('Print', 'Second Print', 'Nellateeta', 'Udukulu', 'Ironing'))
);
--> statement-breakpoint
CREATE TABLE "pile_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pile_id" uuid NOT NULL,
	"thaan_id" uuid,
	"stage" text,
	"kind" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pile_event_kind_known" CHECK ("pile_event"."kind" in ('created', 'added', 'moved', 'detail_set', 'split', 'photo_set'))
);
--> statement-breakpoint
ALTER TABLE "thaan" ADD COLUMN "pile_id" uuid;--> statement-breakpoint
ALTER TABLE "pile" ADD CONSTRAINT "pile_main_colour_id_lookup_value_id_fk" FOREIGN KEY ("main_colour_id") REFERENCES "public"."lookup_value"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pile" ADD CONSTRAINT "pile_colourway_id_colourway_id_fk" FOREIGN KEY ("colourway_id") REFERENCES "public"."colourway"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pile" ADD CONSTRAINT "pile_created_by_id_actor_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."actor"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pile_event" ADD CONSTRAINT "pile_event_pile_id_pile_id_fk" FOREIGN KEY ("pile_id") REFERENCES "public"."pile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pile_event" ADD CONSTRAINT "pile_event_thaan_id_thaan_id_fk" FOREIGN KEY ("thaan_id") REFERENCES "public"."thaan"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pile_event" ADD CONSTRAINT "pile_event_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actor"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pile_code_key" ON "pile" USING btree ("code");--> statement-breakpoint
CREATE INDEX "pile_status_idx" ON "pile" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "pile_event_pile_idx" ON "pile_event" USING btree ("pile_id","at");--> statement-breakpoint
CREATE INDEX "pile_event_thaan_idx" ON "pile_event" USING btree ("thaan_id");--> statement-breakpoint
ALTER TABLE "thaan" ADD CONSTRAINT "thaan_pile_id_pile_id_fk" FOREIGN KEY ("pile_id") REFERENCES "public"."pile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "thaan_pile_id_idx" ON "thaan" USING btree ("pile_id");--> statement-breakpoint
-- "P1001", "P1002", ... — same pattern as bale_code_seq and thaan_code_seq.
create sequence pile_code_seq start with 1001;

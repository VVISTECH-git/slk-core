CREATE TABLE "stage_target" (
	"stage" text PRIMARY KEY NOT NULL,
	"out_days" numeric(5, 1) NOT NULL,
	"wait_days" numeric(5, 1) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_id" uuid,
	CONSTRAINT "stage_target_stage_known" CHECK ("stage_target"."stage" in (
        'Label Stitching', 'Salava', 'Karakkaya', 'Print', 'Second Print', 'Nellateeta', 'Udukulu', 'Ironing'
      )),
	CONSTRAINT "stage_target_days_positive" CHECK ("stage_target"."out_days" > 0 and "stage_target"."wait_days" > 0)
);
--> statement-breakpoint
ALTER TABLE "stage_target" ADD CONSTRAINT "stage_target_updated_by_id_actor_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."actor"("id") ON DELETE restrict ON UPDATE no action;
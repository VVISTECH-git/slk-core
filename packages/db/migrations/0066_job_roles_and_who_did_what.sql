-- Two connected things: a real job-role concept ("Bale Custodian"), and
-- filling in the accountability that was missing everywhere except bale
-- creation. Cutting, generating QR codes, and marking a bale returned all
-- happened with no record of who did it.
--
-- job_role is a maintained list, empty to start — same reasoning as
-- supplier and cloth_item: the client names roles as they're needed,
-- nothing is guess-seeded. actor_job_role is the many-to-many: a role can
-- be held by more than one person, and a person isn't limited to one role.
--
-- handover.received_by is new too, even though the handover screen isn't
-- built yet — recorded_by there already meant "who sent it"; this is "who
-- confirmed it back", a different act and often a different shift.

CREATE TABLE "job_role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX "job_role_name_key" ON "job_role" USING btree ("name");--> statement-breakpoint

CREATE TABLE "actor_job_role" (
	"actor_id" uuid NOT NULL,
	"job_role_id" uuid NOT NULL,
	CONSTRAINT "actor_job_role_actor_id_job_role_id_pk" PRIMARY KEY("actor_id", "job_role_id")
);--> statement-breakpoint

CREATE INDEX "actor_job_role_job_role_idx" ON "actor_job_role" USING btree ("job_role_id");--> statement-breakpoint

ALTER TABLE "actor_job_role" ADD CONSTRAINT "actor_job_role_actor_id_actor_id_fk"
  FOREIGN KEY ("actor_id") REFERENCES "public"."actor"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "actor_job_role" ADD CONSTRAINT "actor_job_role_job_role_id_job_role_id_fk"
  FOREIGN KEY ("job_role_id") REFERENCES "public"."job_role"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "bale" ADD COLUMN "cut_by_id" uuid;--> statement-breakpoint
ALTER TABLE "bale" ADD COLUMN "returned_by_id" uuid;--> statement-breakpoint

ALTER TABLE "bale" ADD CONSTRAINT "bale_cut_by_id_actor_id_fk"
  FOREIGN KEY ("cut_by_id") REFERENCES "public"."actor"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "bale" ADD CONSTRAINT "bale_returned_by_id_actor_id_fk"
  FOREIGN KEY ("returned_by_id") REFERENCES "public"."actor"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "thaan" ADD COLUMN "qr_generated_by_id" uuid;--> statement-breakpoint

ALTER TABLE "thaan" ADD CONSTRAINT "thaan_qr_generated_by_id_actor_id_fk"
  FOREIGN KEY ("qr_generated_by_id") REFERENCES "public"."actor"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "handover" ADD COLUMN "received_by_id" uuid;--> statement-breakpoint

ALTER TABLE "handover" ADD CONSTRAINT "handover_received_by_id_actor_id_fk"
  FOREIGN KEY ("received_by_id") REFERENCES "public"."actor"("id")
  ON DELETE restrict ON UPDATE no action;

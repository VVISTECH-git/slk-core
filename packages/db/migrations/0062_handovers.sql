-- Kora to Shelf, step three: a Thaan moving through the stage pipeline —
-- Kora to Salava, Salava to Karakkaya, Karakkaya to Print, Second Print,
-- Print to Nellateeta, Neelateeta to Udukulu, Ironing.
--
-- One row per stage a Thaan goes through: sent (to a vendor, or kept
-- in-house when vendor_id is null) and, later, received back. A Thaan's
-- current state is derived from these rows rather than stored on `thaan`
-- itself — no open row means it's at home awaiting its next stage, one
-- open row means it's out for that row's stage. The partial unique index
-- is what guarantees "at most one open row per Thaan" rather than just
-- hoping the app gets it right.

CREATE TABLE "handover" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thaan_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"vendor_id" uuid,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_at" timestamp with time zone,
	"notes" text,
	"recorded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX "handover_one_open_per_thaan" ON "handover" USING btree ("thaan_id") WHERE "handover"."received_at" is null;--> statement-breakpoint

ALTER TABLE "handover" ADD CONSTRAINT "handover_thaan_id_thaan_id_fk"
  FOREIGN KEY ("thaan_id") REFERENCES "public"."thaan"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "handover" ADD CONSTRAINT "handover_vendor_id_vendor_id_fk"
  FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "handover" ADD CONSTRAINT "handover_recorded_by_id_actor_id_fk"
  FOREIGN KEY ("recorded_by_id") REFERENCES "public"."actor"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "handover" ADD CONSTRAINT "handover_stage_known" CHECK ("handover"."stage" in (
  'Kora to Salava', 'Salava to Karakkaya', 'Karakkaya to Print',
  'Second Print', 'Print to Nellateeta', 'Neelateeta to Udukulu', 'Ironing'
));

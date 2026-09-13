-- Kora to Shelf, step one: receiving a bale.
--
-- Deliberately not built on design / colourway / piece. Those assume a
-- saree's design and colour are already known before it exists, which is
-- backwards for how Kalamkari is actually made — a bale of raw kora cloth
-- arrives with nothing decided yet. This table, and everything that follows
-- it (cutting, QR codes, handovers, the stage pipeline), stands on its own
-- until a finished piece is ready to become a real product. See
-- docs/decisions/0002-a-piece-can-exist-before-its-product-does.md.
--
-- This migration is only the receiving step. Nothing here sets `status` to
-- 'cut' yet — that comes with the cutting step, not built yet either.

CREATE SEQUENCE "bale_code_seq" START WITH 900001 INCREMENT BY 1;--> statement-breakpoint

CREATE TABLE "bale" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"supplier_name" text NOT NULL,
	"transporter" text,
	"invoice_number" text,
	"invoice_date" date,
	"metres_received" numeric(10, 2) NOT NULL,
	"item_description" text,
	"bale_count" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'awaiting_cutting' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bale_status_known" CHECK ("bale"."status" in ('awaiting_cutting', 'cut'))
);--> statement-breakpoint

ALTER TABLE "bale" ADD CONSTRAINT "bale_recorded_by_id_actor_id_fk"
  FOREIGN KEY ("recorded_by_id") REFERENCES "public"."actor"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "bale_code_key" ON "bale" USING btree ("code");

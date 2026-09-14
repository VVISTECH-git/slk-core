-- Kora to Shelf, step three continued: what a vendor charges, what they've
-- billed, and what's been paid. `vendor_rate` is a per-vendor, per-stage
-- unit price; `vendor_transaction` is a billable batch, created when a
-- batch of Thaans is scanned back in from a vendor; `vendor_payment` is
-- money actually paid, kept separate since a vendor is settled against
-- their running balance, not invoice by invoice.

CREATE TABLE "vendor_rate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX "vendor_rate_vendor_stage_key" ON "vendor_rate" USING btree ("vendor_id", "stage");--> statement-breakpoint

ALTER TABLE "vendor_rate" ADD CONSTRAINT "vendor_rate_vendor_id_vendor_id_fk"
  FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "vendor_rate" ADD CONSTRAINT "vendor_rate_stage_known" CHECK ("vendor_rate"."stage" in (
  'Salava', 'Karakkaya', 'Print', 'Second Print', 'Nellateeta', 'Udukulu', 'Ironing'
));--> statement-breakpoint

CREATE TABLE "vendor_transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"piece_count" integer NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"transaction_date" date DEFAULT current_date NOT NULL,
	"notes" text,
	"recorded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "vendor_transaction" ADD CONSTRAINT "vendor_transaction_vendor_id_vendor_id_fk"
  FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "vendor_transaction" ADD CONSTRAINT "vendor_transaction_recorded_by_id_actor_id_fk"
  FOREIGN KEY ("recorded_by_id") REFERENCES "public"."actor"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "vendor_transaction" ADD CONSTRAINT "vendor_transaction_stage_known" CHECK ("vendor_transaction"."stage" in (
  'Salava', 'Karakkaya', 'Print', 'Second Print', 'Nellateeta', 'Udukulu', 'Ironing'
));--> statement-breakpoint

CREATE TABLE "vendor_payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"paid_on" date DEFAULT current_date NOT NULL,
	"method" text,
	"notes" text,
	"recorded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "vendor_payment" ADD CONSTRAINT "vendor_payment_vendor_id_vendor_id_fk"
  FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "vendor_payment" ADD CONSTRAINT "vendor_payment_recorded_by_id_actor_id_fk"
  FOREIGN KEY ("recorded_by_id") REFERENCES "public"."actor"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "handover" ADD COLUMN "vendor_transaction_id" uuid;--> statement-breakpoint

ALTER TABLE "handover" ADD CONSTRAINT "handover_vendor_transaction_id_vendor_transaction_id_fk"
  FOREIGN KEY ("vendor_transaction_id") REFERENCES "public"."vendor_transaction"("id")
  ON DELETE set null ON UPDATE no action;

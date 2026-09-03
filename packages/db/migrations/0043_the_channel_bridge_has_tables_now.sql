-- What apps/sync reads and writes. Nothing in this file makes a Shopify API
-- call — that needs a token nobody has yet — but the shape it will write into
-- can exist before the worker that fills it does.
--
-- Five tables, following the 3 Sep design:
--
--   channel            a storefront: SLK's own store, Aartisanz later
--   channel_location   which of our locations feed that channel's count
--   channel_link       what a design or a consignment has become there —
--                       a collection, or a product — never both on one row
--   reservation         stock spoken for by an order that has not shipped
--   channel_event       every webhook Shopify has sent, by its own event id
--
-- Credentials are not here. A Shopify Admin API token is read once by a
-- server process and never by a browser — the same shape as R2's — and R2's
-- live in environment variables, not a table any request handler can select
-- from. channel.code is also the variable prefix: SHOPIFY_SLK_STORE_DOMAIN,
-- SHOPIFY_SLK_ADMIN_TOKEN, SHOPIFY_SLK_WEBHOOK_SECRET — the three
-- .env.example has named since before this file existed.

CREATE TABLE "channel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"shopify_event_id" text NOT NULL,
	"topic" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "channel_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"design_id" uuid,
	"batch_id" uuid,
	"shopify_collection_id" text,
	"shopify_product_id" text,
	"shopify_variant_id" text,
	"shopify_inventory_item_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_link_exactly_one_kind" CHECK (
        (
          "channel_link"."design_id" is not null and "channel_link"."batch_id" is null
          and "channel_link"."shopify_collection_id" is not null
          and "channel_link"."shopify_product_id" is null
          and "channel_link"."shopify_variant_id" is null
          and "channel_link"."shopify_inventory_item_id" is null
        ) or (
          "channel_link"."batch_id" is not null and "channel_link"."design_id" is null
          and "channel_link"."shopify_product_id" is not null
          and "channel_link"."shopify_variant_id" is not null
          and "channel_link"."shopify_inventory_item_id" is not null
          and "channel_link"."shopify_collection_id" is null
        )
      )
);
--> statement-breakpoint
CREATE TABLE "channel_location" (
	"channel_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	CONSTRAINT "channel_location_channel_id_location_id_pk" PRIMARY KEY("channel_id","location_id")
);
--> statement-breakpoint
CREATE TABLE "reservation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"external_order_id" text NOT NULL,
	"external_order_name" text,
	"qty" integer NOT NULL,
	"status" text DEFAULT 'held' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservation_qty_positive" CHECK ("reservation"."qty" > 0),
	CONSTRAINT "reservation_status_known" CHECK ("reservation"."status" in ('held', 'fulfilled', 'released'))
);
--> statement-breakpoint
ALTER TABLE "channel_event" ADD CONSTRAINT "channel_event_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_link" ADD CONSTRAINT "channel_link_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_link" ADD CONSTRAINT "channel_link_design_id_design_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."design"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_link" ADD CONSTRAINT "channel_link_batch_id_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_location" ADD CONSTRAINT "channel_location_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_location" ADD CONSTRAINT "channel_location_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_batch_id_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_code_key" ON "channel" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_event_channel_shopify_event_key" ON "channel_event" USING btree ("channel_id","shopify_event_id");--> statement-breakpoint
CREATE INDEX "channel_event_unprocessed_idx" ON "channel_event" USING btree ("received_at") WHERE "channel_event"."processed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_link_channel_design_key" ON "channel_link" USING btree ("channel_id","design_id");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_link_channel_batch_key" ON "channel_link" USING btree ("channel_id","batch_id");--> statement-breakpoint
CREATE INDEX "channel_link_design_idx" ON "channel_link" USING btree ("design_id");--> statement-breakpoint
CREATE INDEX "channel_link_batch_idx" ON "channel_link" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "channel_location_location_idx" ON "channel_location" USING btree ("location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_channel_order_batch_key" ON "reservation" USING btree ("channel_id","external_order_id","batch_id");--> statement-breakpoint
CREATE INDEX "reservation_batch_status_idx" ON "reservation" USING btree ("batch_id","status");--> statement-breakpoint

COMMENT ON TABLE "channel_link" IS
  'What a design or a consignment has become on a channel — a collection, or a product. Never both on one row; the check constraint is what stops it.';--> statement-breakpoint
COMMENT ON TABLE "reservation" IS
  'Stock spoken for by an order that has not shipped. Never deleted, like a movement: a released reservation is a fact, not an error to erase.';--> statement-breakpoint
COMMENT ON COLUMN "reservation"."external_order_id" IS
  'Shopify''s order id. The unique index on (channel_id, external_order_id, batch_id) is what makes a repeated webhook update this row instead of doubling the hold.';--> statement-breakpoint
COMMENT ON TABLE "channel_event" IS
  'Every webhook received, keyed by Shopify''s own event id. A row with error set and processed_at null is one the nightly reconciliation, or a person, needs to look at.';--> statement-breakpoint


-- ── What a channel may sell, right now ──────────────────────────────────
--
-- Per channel and per consignment, because channel_location says a channel
-- may not draw on every location we hold stock in, so the answer to "how
-- many can this storefront sell" is not the same number for every channel
-- even when it is the same saree.
--
-- Only meaningful for a serialised design — the whole point of a per-batch
-- listing is that piece_position can say which pieces of this consignment
-- are still held, and that is only true for something tagged one by one. A
-- pooled product type gets null here rather than a zero that would read as
-- sold out; an honest "cannot say" beats a confident wrong answer.
--
-- Reservations, not the ledger: booking an order does not move stock, so
-- what is sellable is what piece_position finds held, minus what an open
-- reservation has spoken for.
CREATE VIEW channel_batch_sellable AS
WITH held AS (
  SELECT cl.channel_id, p.batch_id, count(*)::int AS qty
  FROM piece p
  JOIN piece_position pp ON pp.piece_id = p.id AND pp.is_held
  JOIN channel_location cl ON cl.location_id = pp.location_id
  GROUP BY cl.channel_id, p.batch_id
),
reserved AS (
  SELECT channel_id, batch_id, sum(qty)::int AS qty
  FROM reservation
  WHERE status = 'held'
  GROUP BY channel_id, batch_id
)
SELECT
  ch.id                                       AS channel_id,
  b.id                                        AS batch_id,
  b.colourway_id,
  b.code,
  d.is_serialised,
  CASE WHEN d.is_serialised THEN coalesce(held.qty, 0) END       AS on_hand,
  CASE WHEN d.is_serialised THEN coalesce(reserved.qty, 0) END   AS reserved,
  CASE WHEN d.is_serialised
    THEN coalesce(held.qty, 0) - coalesce(reserved.qty, 0)
  END                                                             AS sellable
FROM channel ch
JOIN batch b       ON true
JOIN colourway c   ON c.id = b.colourway_id
JOIN design d      ON d.id = c.design_id
LEFT JOIN held      ON held.channel_id = ch.id AND held.batch_id = b.id
LEFT JOIN reserved  ON reserved.channel_id = ch.id AND reserved.batch_id = b.id
WHERE ch.is_active;
--> statement-breakpoint

COMMENT ON VIEW channel_batch_sellable IS
  'What a channel may currently sell of a consignment: pieces piece_position finds held at that channel''s locations, minus open reservations. Null for a pooled product type — there is no honest number to give it.';

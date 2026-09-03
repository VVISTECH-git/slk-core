import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { batch, design, location } from "./catalogue";

/**
 * The channel bridge's own tables — what apps/sync reads and writes.
 *
 * A consignment is what gets listed (see the 3 Sep design), so this is
 * mostly a consignment's shadow on the other side of the bridge: which
 * Shopify product it became, how much of it is spoken for by an order
 * that has not shipped, and the webhook log that makes an inbound event
 * safe to receive twice.
 *
 * Credentials are deliberately not here. A Shopify Admin API token is a
 * secret with the same shape as R2's — read once by a server process,
 * never by a browser — and R2's live in environment variables, not a
 * table any request handler can select from. `channel.code` doubles as
 * the prefix: `slk` reads `SHOPIFY_SLK_STORE_DOMAIN`,
 * `SHOPIFY_SLK_ADMIN_TOKEN`, `SHOPIFY_SLK_WEBHOOK_SECRET` — the three
 * variables `.env.example` has named since before this file existed.
 */

export const channel = pgTable(
  "channel",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * Short and stable — it is also the environment-variable prefix, so
     * renaming a channel here without updating three variables elsewhere
     * would point the bridge at nothing. `slk`, `aartisanz`.
     */
    code: text("code").notNull(),
    name: text("name").notNull(),

    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("channel_code_key").on(t.code)],
);

/**
 * Which of our locations a channel's sellable count is drawn from.
 *
 * SLK's own store reads all three today — warehouse and both retail units —
 * because a walk-in sale is recorded as it happens and the bridge corrects
 * Shopify within seconds. That is a fact about this channel, not a rule the
 * bridge should hard-code: Aartisanz, or a channel added later, may want to
 * sell warehouse stock only. A join table says so per channel instead of a
 * constant somewhere reading "all internal locations".
 */
export const channelLocation = pgTable(
  "channel_location",
  {
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channel.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => location.id, { onDelete: "restrict" }),
  },
  (t) => [
    primaryKey({ columns: [t.channelId, t.locationId] }),
    index("channel_location_location_idx").on(t.locationId),
  ],
);

/**
 * What a thing here has become on a channel — the mapping the bridge reads
 * before every push, so a second run updates a listing instead of
 * duplicating it.
 *
 * One row is one of two shapes, never both:
 *
 *   a design      → a Shopify collection      (the durable address)
 *   a consignment → a product, variant and inventory item (the listing)
 *
 * A collection is not a listing and a consignment is not a design, so this
 * is not the same row wearing two hats — it is genuinely two different
 * relationships that happen to want the same bookkeeping: an external id
 * to reuse, and a moment to know it was last touched. The check constraint
 * is what stops a row claiming to be both, or neither.
 */
export const channelLink = pgTable(
  "channel_link",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channel.id, { onDelete: "cascade" }),

    designId: uuid("design_id").references(() => design.id, {
      onDelete: "cascade",
    }),
    batchId: uuid("batch_id").references(() => batch.id, {
      onDelete: "cascade",
    }),

    /** Set only alongside designId — the collection a design's runs sit in. */
    shopifyCollectionId: text("shopify_collection_id"),

    /** Set only alongside batchId — one consignment, one listing. */
    shopifyProductId: text("shopify_product_id"),
    shopifyVariantId: text("shopify_variant_id"),
    shopifyInventoryItemId: text("shopify_inventory_item_id"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("channel_link_channel_design_key").on(t.channelId, t.designId),
    uniqueIndex("channel_link_channel_batch_key").on(t.channelId, t.batchId),
    index("channel_link_design_idx").on(t.designId),
    index("channel_link_batch_idx").on(t.batchId),
    check(
      "channel_link_exactly_one_kind",
      sql`
        (
          ${t.designId} is not null and ${t.batchId} is null
          and ${t.shopifyCollectionId} is not null
          and ${t.shopifyProductId} is null
          and ${t.shopifyVariantId} is null
          and ${t.shopifyInventoryItemId} is null
        ) or (
          ${t.batchId} is not null and ${t.designId} is null
          and ${t.shopifyProductId} is not null
          and ${t.shopifyVariantId} is not null
          and ${t.shopifyInventoryItemId} is not null
          and ${t.shopifyCollectionId} is null
        )
      `,
    ),
  ],
);

/**
 * Stock spoken for by an order that has not shipped.
 *
 * Booking an order does not move anything — nothing physical has happened,
 * so nothing is written to the ledger. What Shopify is told afterwards is
 * on hand minus what is held here, and the movement itself is written at
 * packing, out of wherever the piece actually came from. See the 3 Sep
 * design for why: there is no separate total to reduce on booking, because
 * on hand already is the sum of the ledger, and reducing one without the
 * other is how the two stop agreeing.
 *
 * Against a consignment, not a colourway — the consignment is what Shopify
 * lists and what carries its own stock count, so it is what an order for
 * that listing reserves against.
 */
export const reservation = pgTable(
  "reservation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channel.id, { onDelete: "restrict" }),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batch.id, { onDelete: "restrict" }),

    /** Shopify's order id — what a cancellation or a fulfilment refers back to. */
    externalOrderId: text("external_order_id").notNull(),
    /** "#1042" — for a human reading the picking list, never used as a key. */
    externalOrderName: text("external_order_name"),

    qty: integer("qty").notNull(),

    /**
     * held      an open order has this many spoken for
     * fulfilled the movement was written at packing; this row is history
     * fulfilled the order shipped; the movement is written and this row is
     *           the record of which pieces it was
     * released  the order was cancelled or refunded before it shipped
     *
     * Never deleted, for the same reason a movement never is: a reservation
     * that existed and was released is a fact, and erasing the row erases
     * the explanation for why the count moved and then moved back.
     */
    status: text("status").notNull().default("held"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // One row per order per consignment. A second webhook for the same order
    // updates this one rather than doubling the hold — the qty an order
    // wants of one listing does not change after it is placed.
    uniqueIndex("reservation_channel_order_batch_key").on(
      t.channelId,
      t.externalOrderId,
      t.batchId,
    ),
    index("reservation_batch_status_idx").on(t.batchId, t.status),
    check("reservation_qty_positive", sql`${t.qty} > 0`),
    check(
      "reservation_status_known",
      sql`${t.status} in ('held', 'fulfilled', 'released')`,
    ),
  ],
);

/**
 * Every webhook Shopify has sent, keyed by the id Shopify itself put on it.
 *
 * Not `idempotency` — that table is keyed to an actor for the mobile API's
 * create-a-record flow, and a webhook has no actor and no idempotency key of
 * our choosing. Shopify assigns the id, delivers at least once, and will
 * occasionally deliver twice; this is what makes the second delivery a
 * no-op instead of a second reservation.
 *
 * Kept whether or not it was processed cleanly. A row with `error` set and
 * `processedAt` null is one the nightly reconciliation, or a person, needs
 * to look at — the alternative is a webhook that failed silently and stock
 * that quietly drifts from what Shopify believes.
 */
export const channelEvent = pgTable(
  "channel_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channel.id, { onDelete: "restrict" }),

    /** The X-Shopify-Webhook-Id header — Shopify's own idempotency key. */
    shopifyEventId: text("shopify_event_id").notNull(),
    /** "orders/create", "orders/cancelled", "refunds/create". */
    topic: text("topic").notNull(),

    /** The body, for replay and for reading what actually arrived. */
    payload: jsonb("payload").notNull().default({}),

    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Null until handled. Set once, never moved back to null. */
    processedAt: timestamp("processed_at", { withTimezone: true }),
    /** What went wrong, if it did. Null on a clean run. */
    error: text("error"),
  },
  (t) => [
    uniqueIndex("channel_event_channel_shopify_event_key").on(
      t.channelId,
      t.shopifyEventId,
    ),
    index("channel_event_unprocessed_idx")
      .on(t.receivedAt)
      .where(sql`${t.processedAt} is null`),
  ],
);

export type Channel = typeof channel.$inferSelect;
export type ChannelLink = typeof channelLink.$inferSelect;
export type Reservation = typeof reservation.$inferSelect;
export type ChannelEvent = typeof channelEvent.$inferSelect;

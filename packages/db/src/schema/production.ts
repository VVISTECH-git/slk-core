import { check, date, integer, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { actor } from "./access";

/**
 * Kora to Shelf — tracking a piece from raw cloth through to a finished
 * product, independently of the catalogue.
 *
 * Deliberately not built on `design` / `colourway` / `piece`. Those assume a
 * saree's design and colour are known before it exists, which is backwards
 * for how Kalamkari is actually made: a bale of raw kora cloth arrives with
 * nothing decided yet, and only becomes a real product — with a design, a
 * colour, a price — once it comes out the far end of the pipeline. See
 * docs/decisions/0002-a-piece-can-exist-before-its-product-does.md.
 *
 * This file is the first step only: receiving a bale and recording what
 * came with it. Cutting, QR codes, handovers and the stage pipeline are not
 * built yet — they come after this is working and confirmed.
 */

export const bale = pgTable(
  "bale",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** The bale's own lot number — BALE-000001 and up, from a sequence. */
    code: text("code").notNull(),

    /**
     * Free text for now, not a lookup value. That vocabulary belongs to the
     * catalogue this table is deliberately independent of; whether supplier
     * and transporter deserve their own controlled list is worth deciding
     * once there is real data to look at, not guessed at up front.
     */
    supplierName: text("supplier_name").notNull(),
    transporter: text("transporter"),

    /**
     * The paper invoice. Nullable: goods sometimes arrive before the
     * invoice does, and the entry should not be blocked on paperwork that
     * is genuinely still in the post.
     */
    invoiceNumber: text("invoice_number"),
    invoiceDate: date("invoice_date"),

    /** What was actually received — the one fact every entry starts from. */
    metresReceived: numeric("metres_received", { precision: 10, scale: 2 }).notNull(),

    /** A rough description of the cloth — "Cotton Fabric A40s". Not a taxonomy. */
    itemDescription: text("item_description"),

    /** How many physical bales this one entry covers. */
    baleCount: integer("bale_count").notNull().default(1),

    /**
     * Whether this bale has been cut yet. Two states, not three: the
     * business asked for cutting to be a single sitting rather than a
     * process that can sit half-done, so there is no "in progress" to
     * track. Cutting itself is not built yet — nothing sets this to `cut`
     * until it is.
     */
    status: text("status").notNull().default("awaiting_cutting"),

    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    /** Who made this entry. Nullable for the same reason `movement.actorId` is. */
    recordedBy: uuid("recorded_by_id").references(() => actor.id, {
      onDelete: "restrict",
    }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("bale_code_key").on(t.code),
    check("bale_status_known", sql`${t.status} in ('awaiting_cutting', 'cut')`),
  ],
);

export type Bale = typeof bale.$inferSelect;

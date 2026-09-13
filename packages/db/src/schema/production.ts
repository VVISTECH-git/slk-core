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

/**
 * A supplier of raw kora cloth, and the running count of bales received
 * from them.
 *
 * Its own table, not a lookup value — that vocabulary belongs to the
 * catalogue this file is deliberately independent of. `codePrefix` is the
 * letter the old spreadsheet already used per supplier ("A" for APA, and so
 * on): a bale's own code is that prefix plus this counter, so codes read
 * the same way staff already read them, not a new convention layered on
 * top of a familiar one.
 */
export const supplier = pgTable(
  "supplier",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),

    /**
     * A short code, chosen by hand when the supplier is added. Not derived
     * from the name, and not migrated from the old spreadsheet's letters —
     * checked against its real history, the same supplier was given
     * different letters at different times and the same letter went to
     * more than one supplier, so there is no clean mapping to carry
     * forward. The client picks the letters going forward instead.
     */
    codePrefix: text("code_prefix").notNull(),

    /**
     * The next bale number for this supplier. Incremented in the same
     * transaction that mints a bale's code, by a plain `UPDATE ...
     * RETURNING` rather than a Postgres sequence — a sequence is one
     * counter for the whole table, and this needs one counter per
     * supplier, starting at 1 each.
     */
    nextBaleNumber: integer("next_bale_number").notNull().default(1),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("supplier_name_key").on(t.name),
    uniqueIndex("supplier_code_prefix_key").on(t.codePrefix),
  ],
);

/**
 * A named kind of cloth — "Cotton Fabric A40s", "A Cotton Sarees" — the
 * spreadsheet's own "Item Name" column, which was itself a maintained
 * dropdown of specific names rather than free text. Its own table for the
 * same reason `supplier` is: new names get added deliberately, not typed
 * fresh (and misspelled) on every bale.
 */
export const clothItem = pgTable(
  "cloth_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("cloth_item_name_key").on(t.name)],
);

export const bale = pgTable(
  "bale",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** The supplier's prefix plus their own running number — "A3". */
    code: text("code").notNull(),

    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => supplier.id, { onDelete: "restrict" }),
    transporter: text("transporter"),

    /**
     * The paper invoice. Nullable: goods sometimes arrive before the
     * invoice does, and the entry should not be blocked on paperwork that
     * is genuinely still in the post.
     */
    invoiceNumber: text("invoice_number"),
    invoiceDate: date("invoice_date"),

    /**
     * The broad category — Sarees, Fabric, Chunnies, Bedsheets, Pillows —
     * the same five the spreadsheet's "Unique Items" sheet names. A plain
     * constrained column rather than a maintained list: unlike supplier
     * names, this set has stayed fixed and small, and a table is worth
     * building only once it stops being either.
     */
    type: text("type").notNull(),

    /** What was actually received — the one fact every entry starts from. */
    metresReceived: numeric("metres_received", { precision: 10, scale: 2 }).notNull(),
    /** Mtrs or Nos, matching the spreadsheet's own two units. */
    uom: text("uom").notNull().default("Mtrs"),

    itemId: uuid("item_id")
      .notNull()
      .references(() => clothItem.id, { onDelete: "restrict" }),

    /** How many physical bales this one entry covers. */
    baleCount: integer("bale_count").notNull().default(1),

    /** Whatever does not fit the fields above — the spreadsheet's own "Column 1". */
    notes: text("notes"),

    /**
     * `awaiting_cutting`, `cut`, or `returned`. Not a fourth "cutting in
     * progress" state — the business asked for cutting to be a single
     * sitting rather than a process that can sit half-done. `returned`
     * covers a bale sent back to the supplier (wrong or damaged material),
     * matching the spreadsheet's own "Bale Returned" status. Cutting itself
     * is not built yet — nothing sets this to `cut` until it is.
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
    check("bale_status_known", sql`${t.status} in ('awaiting_cutting', 'cut', 'returned')`),
    check("bale_uom_known", sql`${t.uom} in ('Mtrs', 'Nos')`),
    check(
      "bale_type_known",
      sql`${t.type} in ('Sarees', 'Fabric', 'Chunnies', 'Bedsheets', 'Pillows')`,
    ),
  ],
);

export type Supplier = typeof supplier.$inferSelect;
export type ClothItem = typeof clothItem.$inferSelect;
export type Bale = typeof bale.$inferSelect;

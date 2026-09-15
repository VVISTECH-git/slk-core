import { boolean, check, date, integer, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { actor } from "./access";
import { lookupValue } from "./lookup";

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

    /** "S701", "S702"... — one running number for every supplier, from `supplier_code_seq`. Assigned once, at creation; never typed. */
    code: text("code").notNull(),

    /**
     * A short code, chosen by hand when the supplier is added. Not derived
     * from the name, and not migrated from the old spreadsheet's letters —
     * checked against its real history, the same supplier was given
     * different letters at different times and the same letter went to
     * more than one supplier, so there is no clean mapping to carry
     * forward.
     *
     * No longer feeds into a bale's own code — that's `bale_code_seq` now,
     * one running number for every supplier — so this is purely a short
     * reference for the supplier itself, distinct from `code` above.
     */
    codePrefix: text("code_prefix").notNull(),

    /** Who to call about this supplier — a bale issue, a return, anything. */
    phone: text("phone"),

    /** For tax-compliant invoicing. Nullable — not every supplier has one. */
    gstin: text("gstin"),

    address: text("address"),

    /** The person to reach, when the supplier is a firm rather than an individual. */
    contactPerson: text("contact_person"),

    /**
     * `active` or `inactive` — a supplier stops being offered for a new
     * bale without erasing their history. Every bale already on file keeps
     * pointing at them either way; only the Bale Intake dropdown reads
     * this.
     */
    status: text("status").notNull().default("active"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("supplier_name_key").on(t.name),
    uniqueIndex("supplier_code_key").on(t.code),
    uniqueIndex("supplier_code_prefix_key").on(t.codePrefix),
    check("supplier_status_known", sql`${t.status} in ('active', 'inactive')`),
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

    /** "I401", "I402"... — one running number for every item, from `cloth_item_code_seq`. Assigned once, at creation; never typed. */
    code: text("code").notNull(),

    /**
     * What end product(s) this cloth is suited to — "Sarees", "Fabric" sold
     * as-is, and so on. A set, not a single choice: plain cotton fabric
     * might become either Sarees or Chunnies. Same shape as `vendor.stages`.
     */
    clothTypes: text("cloth_types")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),

    /**
     * Saree-specific facts about the raw cloth itself — true the day the
     * bale arrives, before any cutting or finishing, unlike the
     * design-level choices Product Management owns (Audience, Print
     * Technique, colour...). Null for anything that isn't a saree cloth,
     * and null on a saree cloth until someone sets it.
     */
    hasBlouse: boolean("has_blouse"),
    border: text("border"),
    pallu: text("pallu"),

    /**
     * What the cloth itself is made of — Cotton, Silk. Also a raw-cloth
     * fact, but not saree-specific, so it isn't gated behind Cloth Type the
     * way blouse/border/pallu are. Points at Product Management's own
     * "Fibre Type" list (`lookup_list.code = 'fibre_type'`) rather than a
     * second vocabulary that could say something different for the same
     * fibre — the material doesn't stop being the same fact just because
     * this is Kora to Shelf's own table.
     */
    fibreTypeId: uuid("fibre_type_id").references(() => lookupValue.id, { onDelete: "restrict" }),

    /** `active` or `inactive` — same reasoning as `supplier.status`. */
    status: text("status").notNull().default("active"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("cloth_item_name_key").on(t.name),
    uniqueIndex("cloth_item_code_key").on(t.code),
    check("cloth_item_status_known", sql`${t.status} in ('active', 'inactive')`),
    check("cloth_item_border_known", sql`${t.border} is null or ${t.border} in ('Zari', 'Plain', 'Contrast', 'Tasseled')`),
    check("cloth_item_pallu_known", sql`${t.pallu} is null or ${t.pallu} in ('Same as body', 'Contrast')`),
  ],
);

/**
 * Someone who does a stage of processing — cutting, salava, karakkaya,
 * printing, ironing, and so on — matching the spreadsheet's own "Persons"
 * sheet (one column of names per stage). Deliberately just a name for now:
 * the stage pipeline itself (handovers, which vendor did which stage for
 * which piece) is not built yet, so there is nothing yet to attach a
 * vendor's stage to. This table exists so the list can start being kept
 * accurately ahead of that, the same way `supplier` and `cloth_item` do.
 */
export const vendor = pgTable(
  "vendor",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),

    /** "V801", "V802"... — one running number for every vendor, from `vendor_code_seq`. Assigned once, at creation; never typed. */
    code: text("code").notNull(),

    /** Who gets called to hand off or collect work — the field that matters most here. */
    primaryPhone: text("primary_phone"),

    /** A backup number, for when the primary one doesn't answer. */
    secondaryPhone: text("secondary_phone"),

    /** Vendors are individual artisans working out of a specific place, not a company address. */
    village: text("village"),

    /**
     * Which stage(s) this vendor normally does — "Karakkaya", "Ironing" —
     * matching the spreadsheet's own "Persons" sheet, where the same person
     * could appear under more than one stage. Informational only: nothing
     * enforces or reads this yet, since the handover pipeline it describes
     * is not built. A plain array rather than a join table, because there
     * is no other table yet for it to join against.
     */
    stages: text("stages")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),

    /** A standard rate, a special arrangement — whatever doesn't fit a field above. */
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("vendor_name_key").on(t.name), uniqueIndex("vendor_code_key").on(t.code)],
);

/**
 * What a vendor charges for one stage, per piece — "Karakkaya: ₹5",
 * "Ironing: ₹2". A vendor doing more than one stage can charge a different
 * rate for each, so this is its own table rather than a single column on
 * `vendor`. Optional: a vendor can be on the list, even doing work, before
 * anyone has typed in what they charge — nothing here blocks a handover,
 * only the transaction that bills it (see `handover.vendorTransactionId`).
 */
export const vendorRate = pgTable(
  "vendor_rate",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendor.id, { onDelete: "cascade" }),
    stage: text("stage").notNull(),
    unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("vendor_rate_vendor_stage_key").on(t.vendorId, t.stage),
    check(
      "vendor_rate_stage_known",
      sql`${t.stage} in (
        'Label Stitching', 'Salava', 'Karakkaya', 'Print', 'Second Print', 'Nellateeta', 'Udukulu', 'Ironing'
      )`,
    ),
  ],
);

export const bale = pgTable(
  "bale",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** "1001", "1002"... — one running number for every bale, from `bale_code_seq`. */
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
    /** The bill's own total, in rupees. Same nullability as the rest of the invoice. */
    invoiceAmount: numeric("invoice_amount", { precision: 12, scale: 2 }),

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

    /**
     * SLK's own mark for how premium this particular batch is — not
     * anything the supplier's bill carries, and not fixed to the item: the
     * same cloth item can get a different code bale to bale (e.g. "A3" one
     * delivery, "A4" the next). Freeform rather than a lookup list.
     */
    gradeCode: text("grade_code"),

    /**
     * Whether Thaans from this bale go through Second Print at all. Not
     * every bale needs it; defaulting to `true` keeps today's behavior —
     * every Thaan does every stage — for anything that doesn't explicitly
     * say otherwise. See `stagesFor` in `apps/web/src/lib/stages.ts`.
     */
    needsSecondPrint: boolean("needs_second_print").notNull().default(true),

    /** How many physical bales this one entry covers. */
    baleCount: integer("bale_count").notNull().default(1),

    /** Whatever does not fit the fields above — the spreadsheet's own "Column 1". */
    notes: text("notes"),

    /**
     * `awaiting_cutting`, `cutting_in_progress`, `cut`, or `returned`.
     * Cutting can be partial: recording any Thaans (`recordThaans`) moves
     * an `awaiting_cutting` bale to `cutting_in_progress`, where it can sit
     * through more than one recording before someone closes it out with
     * `markCuttingComplete`, which is the only thing that sets `cut`.
     * `returned` covers a bale sent back to the supplier (wrong or damaged
     * material) while it is still `awaiting_cutting`, matching the
     * spreadsheet's own "Bale Returned" status.
     */
    status: text("status").notNull().default("awaiting_cutting"),

    /**
     * When this bale was entered into the system — the spreadsheet's own
     * "Bill Entry Date", and a different thing from `invoiceDate`: the
     * invoice is dated whenever the supplier prepared it, this is dated
     * whenever staff actually sat down and typed it in, which can be days
     * later. Defaults to today but editable, so an old bale can be
     * back-entered with its real date rather than the day someone got
     * around to it.
     */
    billEntryDate: date("bill_entry_date").notNull().default(sql`current_date`),

    /** Who made this entry. Nullable for the same reason `movement.actorId` is. */
    recordedBy: uuid("recorded_by_id").references(() => actor.id, {
      onDelete: "restrict",
    }),

    /** Who initiated cutting. Null while the bale is still awaiting it. */
    cutBy: uuid("cut_by_id").references(() => actor.id, { onDelete: "restrict" }),

    /** Who marked it returned. Null unless `status` is `returned`. */
    returnedBy: uuid("returned_by_id").references(() => actor.id, { onDelete: "restrict" }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("bale_code_key").on(t.code),
    check(
      "bale_status_known",
      sql`${t.status} in ('awaiting_cutting', 'cutting_in_progress', 'cut', 'returned')`,
    ),
    check("bale_uom_known", sql`${t.uom} in ('Mtrs', 'Nos')`),
    check(
      "bale_type_known",
      sql`${t.type} in ('Sarees', 'Fabric', 'Chunnies', 'Bedsheets', 'Pillows')`,
    ),
  ],
);

/**
 * One `recordThaans` call, kept — `bale.cut_by_id`/`updated_at` only ever
 * hold whoever touched the bale's cutting status *last*, because every
 * subsequent call (another recording, or `markCuttingComplete`) overwrites
 * them in place. Cutting a bale can genuinely take more than one session,
 * by more than one person, so that single mutable pair can't answer "who
 * recorded which Thaans, and when" once there's been more than one
 * recording — this table can, because it's appended to, never updated.
 */
export const baleCuttingEvent = pgTable("bale_cutting_event", {
  id: uuid("id").primaryKey().defaultRandom(),
  baleId: uuid("bale_id")
    .notNull()
    .references(() => bale.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").references(() => actor.id, { onDelete: "restrict" }),
  /** How many Thaans this one recording added. */
  count: integer("count").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One cut unit of cloth from a bale — the spreadsheet's own "Thaan"
 * (see its "Per Thaan Mtr" column). Deliberately not named `piece`: the
 * catalogue already has a `piece` table meaning a finished, identified
 * saree, and this is neither — it is what a bale becomes before any of
 * that is decided. See
 * docs/decisions/0002-a-piece-can-exist-before-its-product-does.md.
 *
 * Created in bulk when a bale is cut — one row per piece, all at once,
 * matching "the total count of cut pieces are entered" rather than one at
 * a time. `code` starts null: cutting and assigning the permanent code are
 * two separate, deliberate acts (a "Generate QR codes" action on the
 * bale), not one.
 */
export const thaan = pgTable(
  "thaan",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    baleId: uuid("bale_id")
      .notNull()
      .references(() => bale.id, { onDelete: "restrict" }),

    /** "T00002001" — assigned once, by `thaan_code_seq`, when its QR is generated. Permanent after that. */
    code: text("code"),

    qrGeneratedAt: timestamp("qr_generated_at", { withTimezone: true }),

    /** Who ran the "Generate QR codes" action — the same person for every Thaan generated together. */
    qrGeneratedBy: uuid("qr_generated_by_id").references(() => actor.id, { onDelete: "restrict" }),

    /**
     * Set when a Thaan is flagged damaged, miscounted, or otherwise unusable
     * — reversible (see `restoreThaan`), unlike deleting the row, which
     * would break every Handover that already references it. Null means
     * still good. A voided Thaan is refused by `checkThaanForSend`.
     */
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: uuid("voided_by_id").references(() => actor.id, { onDelete: "restrict" }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("thaan_code_key").on(t.code)],
);

/**
 * What a vendor is owed for one completed batch of work — created
 * automatically when a batch of Thaans is scanned back in (see
 * `handover.vendorTransactionId`), one row per distinct (vendor, stage) group
 * in that batch. `unitPrice` and `amount` are captured here rather than
 * recomputed from `vendorRate` later, so a rate change afterwards does not
 * silently reprice work already billed.
 */
export const vendorTransaction = pgTable(
  "vendor_transaction",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendor.id, { onDelete: "restrict" }),
    stage: text("stage").notNull(),
    pieceCount: integer("piece_count").notNull(),
    unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    transactionDate: date("transaction_date").notNull().default(sql`current_date`),
    notes: text("notes"),
    /** Who confirmed the receive batch that produced this. */
    recordedBy: uuid("recorded_by_id").references(() => actor.id, { onDelete: "restrict" }),

    /**
     * Finance's sign-off, before money moves — null means still sitting
     * for review. Separate from `paidAt`: a transaction can be approved
     * and still waiting its turn in a payment run.
     */
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by_id").references(() => actor.id, { onDelete: "restrict" }),

    /**
     * Set together with `vendorPaymentId` once this transaction's amount
     * is folded into a payment — see `payVendorTransactions`. Kept apart
     * from the free-form "record a payment" flow (still just
     * `vendor_payment` against the running balance, for advances and
     * adjustments that aren't any particular transaction), so "what's
     * unpaid" is answerable per transaction, not just per vendor.
     */
    paidAt: timestamp("paid_at", { withTimezone: true }),
    vendorPaymentId: uuid("vendor_payment_id").references(() => vendorPayment.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "vendor_transaction_stage_known",
      sql`${t.stage} in (
        'Label Stitching', 'Salava', 'Karakkaya', 'Print', 'Second Print', 'Nellateeta', 'Udukulu', 'Ironing'
      )`,
    ),
  ],
);

/**
 * Money actually paid to a vendor — kept separate from `vendorTransaction`
 * rather than a paid flag on it, because a payment does not have to match
 * one transaction: a vendor is usually settled against their running
 * balance (everything billed, minus everything paid), not invoice by
 * invoice.
 */
export const vendorPayment = pgTable("vendor_payment", {
  id: uuid("id").primaryKey().defaultRandom(),
  vendorId: uuid("vendor_id")
    .notNull()
    .references(() => vendor.id, { onDelete: "restrict" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  paidOn: date("paid_on").notNull().default(sql`current_date`),
  /** Cash, bank transfer, whatever — free text, not a maintained list. */
  method: text("method"),
  notes: text("notes"),
  recordedBy: uuid("recorded_by_id").references(() => actor.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One Thaan's trip through one stage — sent to a vendor (or kept in-house,
 * when `vendorId` is null) on `sentAt`, and back on `receivedAt` once it's
 * done. The stage pipeline itself: Label Stitching, Salava, Karakkaya,
 * Print, Second Print, Nellateeta, Udukulu, Ironing, in that order
 * (`apps/web/src/lib/stages.ts`)
 * — each one the name of the process itself, not a "from → to" label — a
 * Thaan must finish one before the next can start, checked in the server
 * action rather than here, since stage order is a fact about the business,
 * not something a column constraint can express.
 *
 * A Thaan's current state is derived, not stored: no open row (`received_at`
 * is null) for it means it's at home, waiting on whichever stage it hasn't
 * completed yet; one open row means it's out for that row's stage. The
 * partial unique index below is what makes "at most one open row per
 * Thaan" a guarantee rather than a hope.
 */
export const handover = pgTable(
  "handover",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    thaanId: uuid("thaan_id")
      .notNull()
      .references(() => thaan.id, { onDelete: "restrict" }),

    stage: text("stage").notNull(),

    /** Null means this stage was done in-house, not sent to anyone. */
    vendorId: uuid("vendor_id").references(() => vendor.id, { onDelete: "restrict" }),

    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    receivedAt: timestamp("received_at", { withTimezone: true }),

    notes: text("notes"),

    /** Who sent it — recorded at `sentAt`. */
    recordedBy: uuid("recorded_by_id").references(() => actor.id, {
      onDelete: "restrict",
    }),

    /** Who confirmed it back — recorded at `receivedAt`. A different person, often a different shift. */
    receivedBy: uuid("received_by_id").references(() => actor.id, {
      onDelete: "restrict",
    }),

    /**
     * Which billing batch this row's cost was rolled into, once received —
     * null for an in-house stage (nothing owed) and null until receipt even
     * for a vendor stage (nothing to bill until the work is actually back).
     */
    vendorTransactionId: uuid("vendor_transaction_id").references(() => vendorTransaction.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("handover_one_open_per_thaan")
      .on(t.thaanId)
      .where(sql`${t.receivedAt} is null`),
    check(
      "handover_stage_known",
      sql`${t.stage} in (
        'Label Stitching', 'Salava', 'Karakkaya', 'Print', 'Second Print', 'Nellateeta', 'Udukulu', 'Ironing'
      )`,
    ),
  ],
);

export type Supplier = typeof supplier.$inferSelect;
export type ClothItem = typeof clothItem.$inferSelect;
export type Vendor = typeof vendor.$inferSelect;
export type VendorRate = typeof vendorRate.$inferSelect;
export type Bale = typeof bale.$inferSelect;
export type Thaan = typeof thaan.$inferSelect;
export type VendorTransaction = typeof vendorTransaction.$inferSelect;
export type VendorPayment = typeof vendorPayment.$inferSelect;
export type Handover = typeof handover.$inferSelect;

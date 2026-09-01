import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import type { LookupStatus } from "@slk/domain";

/**
 * The lookup master — SLK's controlled vocabulary.
 *
 * Records never store a label. They store `lookup_value.id`, which is what
 * makes renaming a value a one-row update instead of a migration across every
 * design, every composed name and half a dozen mapping structures.
 *
 * Seeded from `Master Listing - New.xlsx` verbatim. The workbook's own
 * uncertainty travels with it: see `status` and `needsReview`.
 */

// The states themselves live in @slk/domain, not here. The ops app's value
// editor is a client component, and importing a runtime value out of this
// package would pull the Postgres driver into the browser bundle.
export type { LookupStatus } from "@slk/domain";

export const lookupList = pgTable(
  "lookup_list",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    label: text("label").notNull(),
    description: text("description"),

    /**
     * A list the application depends on by code — UOM, Blouse Available.
     * Values may be relabelled but not removed, because logic reads them.
     */
    isSystem: boolean("is_system").notNull().default(false),

    /**
     * The classification this one only means something under — Silk Sub
     * Family under Fibre Type, Product Sub Type under Product Type.
     *
     * The values already said which parent they sat beneath; this is the
     * list-level fact, which lived only in the seed file until Operational
     * Standard needed to show and change it.
     */
    parentListId: uuid("parent_list_id").references(
      (): AnyPgColumn => lookupList.id,
      { onDelete: "restrict" },
    ),

    /**
     * Whether the question is asked at all.
     *
     * Distinct from a value being retired. A value goes one at a time; a
     * classification is switched off wholesale — Border Style is not wanted,
     * so stop asking rather than retiring every value and leaving an empty
     * dropdown behind.
     */
    isEnabled: boolean("is_enabled").notNull().default(true),

    /** draft, active or retired. Constrained in the database. */
    status: text("status").notNull().default("active"),

    /**
     * The order the directory reads in. Alphabetical puts Audience above
     * Product Type, which is not how anyone thinks about the catalogue.
     */
    sortOrder: integer("sort_order").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("lookup_list_code_key").on(t.code)],
);

export const lookupValue = pgTable(
  "lookup_value",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id")
      .notNull()
      .references(() => lookupList.id, { onDelete: "restrict" }),

    /** Stable slug. Never regenerated — a rename changes `label`, not this. */
    code: text("code").notNull(),
    label: text("label").notNull(),

    /** The workbook's order, which is not always alphabetical. */
    sortOrder: integer("sort_order").notNull().default(0),

    /** What the value means, where the label alone does not say. */
    description: text("description"),

    /**
     * Where the value sits in its life. One column, four states, because the
     * three booleans this replaces could describe five combinations that mean
     * nothing — a value both retired and proposed, most obviously.
     *
     *   draft     Being worked out. Not offered on new records.
     *   proposed  The Correction Log's suggestion, awaiting confirmation.
     *   active    Offered.
     *   retired   No longer offered. Records that carry it keep it — that is
     *             the whole reason retiring exists rather than deleting.
     *
     * Constrained in the database (`lookup_value_status_known`) rather than
     * only in TypeScript, because a Server Action is reachable by POST.
     */
    status: text("status").$type<LookupStatus>().notNull().default("active"),

    /**
     * The value this one sits under — Deer belongs to Fauna.
     *
     * Taxonomy only. It used to carry unit of measure as well, on the
     * grounds that both are "the value on the same row of the next column"
     * in the workbook. They are not the same relationship, and sharing one
     * column meant a value could express one or the other but never both.
     * See `soldById`.
     */
    parentValueId: uuid("parent_value_id").references(
      (): AnyPgColumn => lookupValue.id,
      { onDelete: "restrict" },
    ),

    /**
     * How a product type is measured — Piece, Metre.
     *
     * Its own column rather than sharing `parentValueId`, because "is
     * measured in" and "is a kind of" are different relationships and a
     * value has only one parent slot. Sharing it meant a Product Sub Type
     * could say it is sold by the Piece or say which Product Type it belongs
     * under, but not both.
     */
    soldById: uuid("sold_by_id").references((): AnyPgColumn => lookupValue.id, {
      onDelete: "restrict",
    }),

    /**
     * Pre-selected when a new record is created.
     *
     * A default belongs in the data rather than in the form: almost every
     * saree SLK makes is Clothing, and changing that later should be a click
     * on the Values screen, not an edit and a deploy. At most one per list —
     * enforced by a partial unique index below.
     */
    isDefault: boolean("is_default").notNull().default(false),

    /**
     * Flagged for checking against real stock — the Correction Log's NEEDS
     * REVIEW column.
     *
     * Deliberately not a status. A value can need checking while it is draft,
     * proposed or active, and answering the question does not move it along
     * its life. Two orthogonal things do not belong in one column.
     */
    needsReview: boolean("needs_review").notNull().default(false),

    /** Colour swatch hex, garment piece counts — per-value extras. */
    meta: jsonb("meta").notNull().default({}),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("lookup_value_list_code_key").on(t.listId, t.code),
    uniqueIndex("lookup_value_list_label_key").on(t.listId, t.label),
    index("lookup_value_list_sort_idx").on(t.listId, t.sortOrder),
    index("lookup_value_list_status_idx").on(t.listId, t.status),
    index("lookup_value_parent_idx").on(t.parentValueId),
    // One default per list, enforced by the database rather than by whichever
    // code path happens to set it.
    uniqueIndex("lookup_value_one_default_per_list")
      .on(t.listId)
      .where(sql`${t.isDefault}`),
  ],
);

export type LookupList = typeof lookupList.$inferSelect;
export type LookupValue = typeof lookupValue.$inferSelect;

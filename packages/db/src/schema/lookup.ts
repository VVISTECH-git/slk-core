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

/**
 * The lookup master — SLK's controlled vocabulary.
 *
 * Records never store a label. They store `lookup_value.id`, which is what
 * makes renaming a value a one-row update instead of a migration across every
 * design, every composed name and half a dozen mapping structures.
 *
 * Seeded from `Master Listing - New.xlsx` verbatim. The workbook's own
 * uncertainty travels with it: see `isProposed` and `needsReview`.
 */

export const lookupList = pgTable(
  "lookup_list",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    label: text("label").notNull(),
    description: text("description"),

    /**
     * The workbook stores `colour` and `descriptor` in lower case. New values
     * added through the UI follow suit rather than creating "Indigo" beside
     * "indigo".
     */
    lowercaseValues: boolean("lowercase_values").notNull().default(false),

    /**
     * A list the application depends on by code — UOM, Blouse Available.
     * Values may be relabelled but not removed, because logic reads them.
     */
    isSystem: boolean("is_system").notNull().default(false),

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

    /**
     * Retiring a value sets this false. Existing records keep it; it simply
     * stops being offered on new entries. Values in use are never deleted.
     */
    isActive: boolean("is_active").notNull().default(true),

    /**
     * The workbook's row-aligned companion column, in both its forms:
     *   Motif        → Motif Belongs To  (a genuine category)
     *   Product Type → UOM               (Fabric is sold by the Metre)
     *
     * Both are "the value on the same row of the next column", which is how
     * the source expresses them, so both use this.
     */
    parentValueId: uuid("parent_value_id").references(
      (): AnyPgColumn => lookupValue.id,
      { onDelete: "restrict" },
    ),

    /** Correction Log marks these as proposals awaiting confirmation. */
    isProposed: boolean("is_proposed").notNull().default(false),

    /** Correction Log flags these as NEEDS REVIEW against real stock. */
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
    index("lookup_value_parent_idx").on(t.parentValueId),
  ],
);

export type LookupList = typeof lookupList.$inferSelect;
export type LookupValue = typeof lookupValue.$inferSelect;

import {
  bigint,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { actor } from "./access";
import { colourway } from "./catalogue";

/**
 * The editorial review trail — every time a colourway's `reviewStatus`
 * changed, who did it, and what they said.
 *
 * `colourway.reviewStatus`/`submittedBy`/`reviewedBy` (catalogue.ts) are the
 * denormalised *current* state, read on every list/filter. This table is the
 * history behind that state: append-only, the same reasoning as `movement`
 * — a rejection that happened and was later approved is a fact, and erasing
 * the row erases why the record looked the way it did in between.
 */
export const recordReviewEvent = pgTable(
  "record_review_event",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),

    colourwayId: uuid("colourway_id")
      .notNull()
      .references(() => colourway.id, { onDelete: "cascade" }),

    /** Who moved it. Nullable for the same reason movement.actorId is. */
    actorId: uuid("actor_id").references(() => actor.id, {
      onDelete: "restrict",
    }),

    /** Null on the very first event — a record has no status before draft. */
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),

    /**
     * Required by the app (not the database) on a request_changes
     * transition — "needs changes" with no reason attached is the one
     * outcome this whole trail exists to prevent. Left nullable here since
     * a submit or an approve carries no comment most of the time.
     */
    comment: text("comment"),

    /** Which fields the reviewer flagged, for the admin review screen's gap chips. */
    flaggedFields: jsonb("flagged_fields").notNull().default([]),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("record_review_event_colourway_idx").on(t.colourwayId, t.createdAt),
    check(
      "record_review_event_to_status_known",
      sql`${t.toStatus} in ('draft', 'submitted', 'needs_changes', 'approved')`,
    ),
  ],
);

export type RecordReviewEvent = typeof recordReviewEvent.$inferSelect;

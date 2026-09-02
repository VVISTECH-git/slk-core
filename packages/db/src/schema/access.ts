import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Who is acting, and what lets them.
 *
 *   ACTOR    a person on the floor, or a machine that calls the API
 *     TOKEN    one sign-in — a phone that is currently trusted
 *
 * The ledger already records what happened and when. This records who, which
 * is the question actually asked when a floor count disagrees with the system:
 * not "when did this go wrong" but "who was counting". A movement whose actor
 * is unknown is a number nobody can follow up on.
 *
 * Kept apart from the catalogue because it is the one part of the schema whose
 * rows are people. Deleting a lookup value is housekeeping; deleting an actor
 * would orphan their half of the audit trail, so actors are deactivated and
 * never removed.
 */

export const actor = pgTable(
  "actor",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * What they type to sign in — a short code, not an email.
     *
     * This is typed on a phone, on a floor, by someone holding a saree. An
     * email address is the wrong shape for that, and SLK's staff do not each
     * have one. Unique, and the login looks a person up by it.
     */
    code: text("code").notNull(),
    name: text("name").notNull(),

    /**
     * What they are allowed to do. `floor` can count, move and photograph;
     * `office` can also price and edit the catalogue; `owner` can do
     * everything including managing actors.
     *
     * Text rather than an enum: the roles are still settling, and an enum
     * change is a migration where a string is a value.
     */
    role: text("role").notNull().default("floor"),

    /**
     * scrypt of their PIN, with the salt and parameters inside the string.
     *
     * Null for a machine actor — the sync worker has no PIN and authenticates
     * with a long-lived token issued directly, so a null here is "cannot sign
     * in interactively" rather than "no password set".
     */
    secretHash: text("secret_hash"),

    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("actor_code_key").on(t.code)],
);

/**
 * One issued bearer token.
 *
 * A row per sign-in rather than a column on the actor, because a person has
 * more than one phone and revoking the handset left in an auto-rickshaw must
 * not sign them out of the one in their pocket.
 */
export const actorToken = pgTable(
  "actor_token",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => actor.id, { onDelete: "cascade" }),

    /**
     * SHA-256 of the token. The token itself is returned once, at sign-in, and
     * never stored — so this table leaking does not let anyone in, and there
     * is no screen anywhere that can show an existing token.
     *
     * Plain SHA-256 rather than scrypt, unlike the PIN: this is 32 bytes of
     * randomness, not something a person chose, so there is nothing for a
     * dictionary to guess and the check happens on every single request.
     */
    tokenHash: text("token_hash").notNull(),

    /** Which handset this is, so a lost one can be found in a list and revoked. */
    device: text("device"),

    issuedAt: timestamp("issued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    /**
     * Tokens expire. A phone on a shop floor is shared, mislaid and sold on,
     * and a bearer token that never expires is a key cut once and copied
     * forever.
     */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

    /**
     * Refreshed on use, at most once a day.
     *
     * Enough to answer "is this handset still in service" without writing to
     * the table on every request, which would make a read-only call a write.
     */
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),

    /** Set instead of deleting the row, so a revocation is itself auditable. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("actor_token_hash_key").on(t.tokenHash),
    index("actor_token_actor_idx").on(t.actorId),
  ],
);

/**
 * Failed sign-ins, counted per code.
 *
 * Without this the login accepts unlimited guesses, and a six-digit PIN is a
 * million possibilities that a script works through in under a day — the
 * scrypt cost buys time, not safety.
 *
 * Keyed by **the code as typed**, not by an actor id, and that is the point.
 * A code nobody has must be counted too: keying on the actor would leave
 * unknown codes unlimited, which both lets someone map who works here by
 * watching which codes get locked and lets them pin the server doing expensive
 * hashing for free.
 *
 * Rows are transient — a successful sign-in deletes its own, and stale ones
 * are pruned on later attempts — so this does not grow without bound just
 * because someone typed a thousand different wrong codes.
 */
export const loginAttempt = pgTable("login_attempt", {
  code: text("code").primaryKey(),

  /** Consecutive failures. Reset by a success, never decremented. */
  failures: integer("failures").notNull().default(0),

  lastFailureAt: timestamp("last_failure_at", { withTimezone: true })
    .notNull()
    .defaultNow(),

  /**
   * Refused until this moment, whatever the PIN.
   *
   * Null once the lock has been set and passed — the failure count stays, so
   * the next failure locks again sooner rather than starting over.
   */
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
});

/**
 * Writes that have already been done, so doing them twice is impossible.
 *
 * A phone on a warehouse floor loses signal mid-request, and the request it
 * was halfway through had already committed. The app cannot tell that from a
 * request that never arrived — both look like "cannot reach the server" — so
 * whoever is holding it presses the button again, and the catalogue gains a
 * second design, a second consignment and six more item codes for one delivery.
 *
 * That is not hypothetical: it happened during the first end-to-end test, and
 * `SAR-GEN-COT-0009` had to be deleted by hand.
 *
 * The key is claimed *before* the work and completed after, so a repeat while
 * the first is still running is refused rather than raced. A caller that sends
 * the same key twice gets the same answer both times.
 */
export const idempotency = pgTable("idempotency", {
  /** Chosen by the client, unique per attempt. Opaque here. */
  key: text("key").primaryKey(),

  /**
   * Whose key it is. Two people cannot collide on one, and a key guessed by
   * somebody else cannot be used to read back what it created.
   */
  actorId: uuid("actor_id")
    .notNull()
    .references(() => actor.id, { onDelete: "cascade" }),

  /** What the first attempt created. Null while it is still running. */
  resultId: uuid("result_id"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export type Actor = typeof actor.$inferSelect;
export type ActorToken = typeof actorToken.$inferSelect;
export type LoginAttempt = typeof loginAttempt.$inferSelect;
export type Idempotency = typeof idempotency.$inferSelect;

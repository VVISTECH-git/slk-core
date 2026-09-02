import { and, eq, isNull, sql } from "drizzle-orm";

import { idempotency } from "@slk/db";

import { ApiError } from "@/lib/api";
import { db } from "@/lib/db";

/**
 * Doing a write once, however many times it is asked for.
 *
 * The order is the whole design: **claim, then work, then complete.**
 *
 * Working first and recording afterwards would leave the window that caused
 * the bug — two requests both find nothing recorded, both create. Claiming
 * first closes it: the second request loses the insert race and is told so,
 * rather than quietly doing the work again.
 *
 * The cost of that ordering is a claim that outlives the process which made
 * it — a function killed between claiming and completing leaves a key that
 * answers "still running" forever. That is deliberate. For a stock ledger,
 * refusing a write that may already have happened is the safe failure; timing
 * out the claim and letting it through is how the duplicate comes back.
 */

/** How the caller names this attempt. Same shape the industry uses. */
export const IDEMPOTENCY_HEADER = "idempotency-key";

export function keyFrom(request: Request): string {
  const key = request.headers.get(IDEMPOTENCY_HEADER)?.trim() ?? "";

  if (key === "") {
    throw new ApiError(
      `This request needs an ${IDEMPOTENCY_HEADER} header, so a retry cannot create a second record.`,
      400,
    );
  }

  // Long enough not to collide, short enough not to be a payload. The client
  // sends 32 hex characters; anything in this range is accepted.
  if (key.length < 16 || key.length > 200) {
    throw new ApiError(`That ${IDEMPOTENCY_HEADER} is not a usable key.`, 400);
  }

  return key;
}

/**
 * Take the key, or say what happened to it last time.
 *
 * Returns null when this caller now owns the key and should do the work, or
 * the id the first attempt produced when there is one — in which case the
 * caller must answer with that and do nothing.
 */
export async function claim(
  key: string,
  actorId: string,
): Promise<string | null> {
  /*
    One statement decides the race. Two requests arriving together cannot both
    insert, and the loser gets no row back rather than a second claim.
  */
  const taken = await db
    .insert(idempotency)
    .values({ key, actorId })
    .onConflictDoNothing()
    .returning({ key: idempotency.key });

  if (taken.length > 0) return null;

  const rows = await db
    .select({
      actorId: idempotency.actorId,
      resultId: idempotency.resultId,
      completedAt: idempotency.completedAt,
    })
    .from(idempotency)
    .where(eq(idempotency.key, key))
    .limit(1);

  const existing = rows[0];

  // Raced with a delete — the first attempt failed validation and released it.
  // Try once more rather than refusing something nothing is holding.
  if (existing === undefined) {
    const retry = await db
      .insert(idempotency)
      .values({ key, actorId })
      .onConflictDoNothing()
      .returning({ key: idempotency.key });

    if (retry.length > 0) return null;
    throw new ApiError("That save is already in progress.", 409);
  }

  /*
    Someone else's key.

    Refused without saying what it made. The key is chosen by a client and a
    guessable one must not become a way to read back another person's record.
  */
  if (existing.actorId !== actorId) {
    throw new ApiError("That key belongs to another sign-in.", 409);
  }

  if (existing.completedAt !== null && existing.resultId !== null) {
    return existing.resultId;
  }

  throw new ApiError(
    "That save is already in progress. Check the catalogue before trying again.",
    409,
  );
}

/**
 * Record what the work produced, so a repeat is answered with the same thing.
 *
 * Guarded on the result still being unset, so a late-arriving duplicate cannot
 * overwrite the id the first attempt recorded — the answer a caller already
 * has must not change under it.
 */
export async function complete(key: string, resultId: string): Promise<void> {
  await db
    .update(idempotency)
    .set({ resultId, completedAt: sql`now()` })
    .where(and(eq(idempotency.key, key), isNull(idempotency.resultId)));
}

/**
 * Give the key back, because nothing was created.
 *
 * A draft refused for a missing price is not a completed write — the person
 * fixes the field and saves again, and that second save is the same intent
 * with the same key. Holding the key would refuse it as a duplicate of a
 * record that does not exist.
 */
export async function release(key: string): Promise<void> {
  await db.delete(idempotency).where(eq(idempotency.key, key));
}

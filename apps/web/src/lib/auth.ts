import { createHash, randomBytes } from "node:crypto";

import { and, eq, isNull, or, sql } from "drizzle-orm";

import { actor, actorToken, loginAttempt, type Actor } from "@slk/db";

import { db } from "@/lib/db";

export { hashSecret, verifySecret } from "@slk/domain";

/**
 * The shortest PIN that may be set.
 *
 * Six, not four. Four digits is ten thousand possibilities, which a script
 * works through in well under an hour even against deliberately slow hashing;
 * six is a million, for one more keypress on the floor.
 */
export const MIN_PIN_LENGTH = 6;

/**
 * Signing in, and staying signed in.
 *
 * The ops web app has no login — it sits behind Vercel's own protection and
 * everyone who reaches it is staff. The API cannot borrow that: it is called
 * from a phone on a mobile network, and it writes stock. So the door is here.
 *
 * Two secrets with different jobs, hashed differently on purpose:
 *
 *   a PIN     chosen by a person, short, guessable — scrypt, deliberately slow
 *   a token   32 bytes from the OS, unguessable — SHA-256, deliberately fast
 *
 * Using scrypt for the token would put a hundred milliseconds of key
 * stretching on every single request to defend against a dictionary attack on
 * a value no dictionary contains.
 */

/**
 * How long a sign-in lasts.
 *
 * Thirty days, because the alternative is staff typing a PIN at the start of
 * every shift and then writing it on the back of the phone.
 */
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Roles, weakest first. A check asks for a floor and accepts an owner. */
const ROLE_RANK = { floor: 0, office: 1, owner: 2 } as const;

export type Role = keyof typeof ROLE_RANK;

export function isRole(value: string): value is Role {
  return value in ROLE_RANK;
}

// ── Tokens ──────────────────────────────────────────────────────────────────

function fingerprint(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

/**
 * Issue a token for an actor. Returned once — only its hash is kept, so this
 * is the single moment the value exists anywhere it can be read.
 */
export async function mintToken(
  actorId: string,
  device: string | null,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await db.insert(actorToken).values({
    actorId,
    tokenHash: fingerprint(token),
    device,
    expiresAt,
  });

  return { token, expiresAt };
}

/** Sign one handset out. Revoked, never deleted — see the schema. */
export async function revokeToken(token: string): Promise<void> {
  await db
    .update(actorToken)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(actorToken.tokenHash, fingerprint(token)), isNull(actorToken.revokedAt)),
    );
}

/**
 * The actor a request is acting as, or null.
 *
 * Every condition is checked in the database rather than in TypeScript, so a
 * revoked or expired token cannot be turned into an actor by a missing
 * `if`.
 */
export async function actorFor(request: Request): Promise<Actor | null> {
  const header = request.headers.get("authorization");
  if (header === null) return null;

  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || token === undefined || token === "") {
    return null;
  }

  const hash = fingerprint(token);

  const rows = await db
    .select({
      id: actor.id,
      code: actor.code,
      name: actor.name,
      role: actor.role,
      secretHash: actor.secretHash,
      isActive: actor.isActive,
      createdAt: actor.createdAt,
      updatedAt: actor.updatedAt,
      tokenId: actorToken.id,
      lastUsedAt: actorToken.lastUsedAt,
    })
    .from(actorToken)
    .innerJoin(actor, eq(actor.id, actorToken.actorId))
    .where(
      and(
        eq(actorToken.tokenHash, hash),
        isNull(actorToken.revokedAt),
        sql`${actorToken.expiresAt} > now()`,
        eq(actor.isActive, true),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (row === undefined) return null;

  /*
    Touched at most once a day.

    Knowing a handset is still in service is worth a write; knowing it was
    used four seconds ago is not, and doing it per request would turn every
    read of the catalogue into a write to this table.
  */
  const { tokenId, lastUsedAt, ...found } = row;
  const stale =
    lastUsedAt === null || Date.now() - lastUsedAt.getTime() > 24 * 60 * 60 * 1000;

  if (stale) {
    await db
      .update(actorToken)
      .set({ lastUsedAt: new Date() })
      .where(eq(actorToken.id, tokenId));
  }

  return found;
}

export function allows(role: string, needed: Role): boolean {
  return isRole(role) && ROLE_RANK[role] >= ROLE_RANK[needed];
}

// ── Lockout ─────────────────────────────────────────────────────────────────

/** Failures tolerated before a code is refused at all. */
const MAX_FAILURES = 5;

/** The first lock, doubling with each further failure, up to [MAX_LOCK_MS]. */
const BASE_LOCK_MS = 5 * 60 * 1000;
const MAX_LOCK_MS = 60 * 60 * 1000;

/** How long a quiet code is remembered before its row is swept up. */
const FORGET_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * How long a code is locked once it has failed this many times.
 *
 * Doubling rather than fixed. Five minutes is a nuisance to somebody who
 * mistyped and no obstacle at all to a script, which simply waits; doubling
 * means a script that keeps going is measuring its attack in days by the
 * afternoon, while the person who fat-fingered their PIN is back in after one.
 */
function lockFor(failures: number): number {
  const doublings = Math.max(0, failures - MAX_FAILURES);
  return Math.min(BASE_LOCK_MS * 2 ** doublings, MAX_LOCK_MS);
}

/**
 * Whether this code is currently refused, and until when.
 *
 * Called *before* the PIN is verified. Checking afterwards would still spend
 * the scrypt, which is most of what an attacker is trying to make the server
 * do.
 */
export async function lockedUntil(code: string): Promise<Date | null> {
  const rows = await db
    .select({ until: loginAttempt.lockedUntil })
    .from(loginAttempt)
    .where(and(eq(loginAttempt.code, code), sql`${loginAttempt.lockedUntil} > now()`))
    .limit(1);

  return rows[0]?.until ?? null;
}

/**
 * Count one failure, and lock the code once there have been enough.
 *
 * Returns the moment it is refused until, or null if it is not locked yet —
 * the caller says so, because "wrong PIN" and "wrong PIN, and now you are
 * locked out" are different things to be told.
 */
export async function recordFailure(code: string): Promise<Date | null> {
  /*
    One statement, so two requests racing cannot both read four and write
    five. `excluded` is the row that would have been inserted, and the lock is
    computed from the incremented count in the same expression that stores it.
  */
  const rows = await db.execute<{ failures: number; locked_until: Date | null }>(sql`
    insert into login_attempt (code, failures, last_failure_at, locked_until)
    values (${code}, 1, now(), null)
    on conflict (code) do update set
      failures = login_attempt.failures + 1,
      last_failure_at = now(),
      locked_until = case
        when login_attempt.failures + 1 >= ${MAX_FAILURES}
        then now() + make_interval(secs => ${Math.round(
          lockFor(MAX_FAILURES) / 1000,
        )} * power(2, greatest(0, login_attempt.failures + 1 - ${MAX_FAILURES})))
        else null
      end
    returning failures, locked_until
  `);

  const row = rows[0];
  if (row === undefined || row.locked_until === null) return null;

  // The doubling is capped, which SQL's expression above does not know about.
  const capped = new Date(Date.now() + lockFor(row.failures));
  const stated = new Date(row.locked_until);

  return stated > capped ? capped : stated;
}

/**
 * A successful sign-in forgets everything before it, and sweeps up codes
 * nobody has touched in a day.
 *
 * The prune rides along here rather than in a scheduled job because a login
 * is the only thing that writes this table — there is nothing to clean up
 * that a login did not create, and no cron to go stale.
 */
export async function clearFailures(code: string): Promise<void> {
  await db.delete(loginAttempt).where(eq(loginAttempt.code, code));

  await db
    .delete(loginAttempt)
    .where(sql`${loginAttempt.lastFailureAt} < now() - make_interval(secs => ${FORGET_AFTER_MS / 1000})`);
}

/**
 * Look an actor up by the code they typed, for the login route.
 *
 * Inactive actors are returned rather than filtered out, so the caller can
 * spend the same time verifying their PIN and refuse afterwards — a
 * deactivated code and a wrong one must be indistinguishable from outside.
 */
export async function actorByCode(code: string): Promise<Actor | null> {
  const rows = await db
    .select()
    .from(actor)
    .where(or(eq(actor.code, code), eq(actor.code, code.toLowerCase())))
    .limit(1);

  return rows[0] ?? null;
}

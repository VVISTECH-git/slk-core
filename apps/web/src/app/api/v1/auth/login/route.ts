import { ApiError, body, fail, ok } from "@/lib/api";
import {
  actorByCode,
  clearFailures,
  lockedUntil,
  mintToken,
  recordFailure,
  verifySecret,
} from "@/lib/auth";

/**
 * Sign in with a code and a PIN.
 *
 * The one route that is not guarded, because it is the door.
 *
 * Every failure answers the same way — "That code or PIN is not right", 401 —
 * whether the code is unknown, the PIN is wrong, or the account is switched
 * off. Saying which would let anyone with the URL discover who works here, and
 * `verifySecret` spends the same time on a missing actor as a real one so the
 * clock cannot answer what the words will not.
 *
 * Rate limited per code: five consecutive failures and the code is refused for
 * five minutes, doubling to an hour if whoever it is keeps going. The counter
 * lives in Postgres, not in a module variable — each request here may be a
 * fresh serverless instance, so an in-process counter would reset constantly
 * and limit nothing.
 *
 * Unknown codes are counted the same way as real ones. If they were not, the
 * lockout itself would answer the question the wording is careful not to.
 */
/** "3 minutes", for somebody who wants to know whether to wait or go and ask. */
function minutesUntil(when: Date): string {
  const minutes = Math.max(1, Math.ceil((when.getTime() - Date.now()) / 60000));
  return minutes === 1 ? "a minute" : `${minutes} minutes`;
}

export async function POST(request: Request) {
  let fields: Record<string, unknown>;

  try {
    fields = await body(request);
  } catch (error) {
    if (error instanceof ApiError) return fail(error.message, error.status);
    throw error;
  }

  const code = typeof fields["code"] === "string" ? fields["code"].trim() : "";
  const pin = typeof fields["pin"] === "string" ? fields["pin"] : "";

  /**
   * Which handset this is, so a lost one can be revoked by name rather than
   * by signing everybody out. Free text from the phone; trimmed and capped
   * because it is displayed in a list.
   */
  const device =
    typeof fields["device"] === "string" && fields["device"].trim() !== ""
      ? fields["device"].trim().slice(0, 120)
      : null;

  if (code === "" || pin === "") {
    return fail("A code and a PIN are needed.", 400);
  }

  let who: Awaited<ReturnType<typeof actorByCode>>;
  let locked: Date | null;

  try {
    // Before the PIN is checked, not after: the scrypt is the expensive part,
    // and making the server spend it is half of what an attacker wants.
    locked = await lockedUntil(code);
    who = locked === null ? await actorByCode(code) : null;
  } catch (error) {
    console.error("[api] login lookup", error);
    return fail("Cannot reach the database.", 503);
  }

  if (locked !== null) {
    return fail(
      `Too many attempts. Try again in ${minutesUntil(locked)}.`,
      // 429, not 401. The phone's client signs out on a 401, and being locked
      // out for five minutes is not the same as having a bad token.
      429,
    );
  }

  const correct = await verifySecret(pin, who?.secretHash ?? null);

  if (who === null || !correct || !who.isActive) {
    const nowLocked = await recordFailure(code);

    return fail(
      nowLocked === null
        ? "That code or PIN is not right."
        : `That code or PIN is not right. Too many attempts — try again in ${minutesUntil(nowLocked)}.`,
      nowLocked === null ? 401 : 429,
    );
  }

  await clearFailures(code);

  const { token, expiresAt } = await mintToken(who.id, device);

  return ok({
    token,
    expiresAt: expiresAt.toISOString(),
    actor: { id: who.id, code: who.code, name: who.name, role: who.role },
  });
}

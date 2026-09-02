"use server";

import {
  actorByCode,
  clearFailures,
  lockedUntil,
  recordFailure,
  verifySecret,
} from "@/lib/auth";
import { startSession } from "@/lib/session";

/**
 * The portal's door.
 *
 * Every step is the one `/api/v1/auth/login` already takes, in the same order
 * and for the same reasons: the lockout is checked before the PIN so a script
 * cannot make the server spend scrypt for free, every failure answers with the
 * same words whether the code is unknown or the account is switched off, and
 * `verifySecret` spends the same time on a missing actor as a real one so the
 * clock cannot answer what the wording will not.
 *
 * Kept as its own action rather than posting to that route: a browser wants a
 * cookie set and a redirect, and a phone wants a token in a JSON body. Same
 * checks, same table, two ways of being handed the result.
 */

export interface SignInResult {
  ok: boolean;
  message?: string;
}

/** "3 minutes", for somebody deciding whether to wait or go and ask. */
function minutesUntil(when: Date): string {
  const minutes = Math.max(1, Math.ceil((when.getTime() - Date.now()) / 60000));
  return minutes === 1 ? "a minute" : `${minutes} minutes`;
}

export async function signIn(
  _previous: SignInResult | null,
  form: FormData,
): Promise<SignInResult> {
  const code = String(form.get("code") ?? "").trim();
  const pin = String(form.get("pin") ?? "");

  if (code === "" || pin === "") {
    return { ok: false, message: "A code and a PIN are needed." };
  }

  let locked: Date | null;
  let who: Awaited<ReturnType<typeof actorByCode>>;

  try {
    locked = await lockedUntil(code);
    who = locked === null ? await actorByCode(code) : null;
  } catch (error) {
    console.error("[login] lookup", error);
    return { ok: false, message: "Cannot reach the database." };
  }

  if (locked !== null) {
    return {
      ok: false,
      message: `Too many attempts. Try again in ${minutesUntil(locked)}.`,
    };
  }

  const correct = await verifySecret(pin, who?.secretHash ?? null);

  if (who === null || !correct || !who.isActive) {
    const nowLocked = await recordFailure(code);

    return {
      ok: false,
      message:
        nowLocked === null
          ? "That code or PIN is not right."
          : `That code or PIN is not right. Too many attempts — try again in ${minutesUntil(nowLocked)}.`,
    };
  }

  await clearFailures(code);

  // Named so a browser session is tellable from a handset on the Staff screen,
  // where the point of the list is spotting the device you want to revoke.
  await startSession(who.id, "Web portal");

  return { ok: true };
}

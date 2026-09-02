import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import type { Actor } from "@slk/db";

import {
  actorForToken,
  allows,
  bearerFrom,
  mintToken,
  revokeToken,
  type Role,
} from "@/lib/auth";

/**
 * Who is using the portal.
 *
 * The portal had no door at all. The comment at the top of `auth.ts` said it
 * sat behind Vercel's own protection and everyone reaching it was staff; it
 * did not, and `curl https://slk-core.vercel.app/records` returned the
 * catalogue, the prices and the stock to anyone who asked.
 *
 * The door is the one the phone already uses. A sign-in mints a row in
 * `actor_token` exactly as the API does, and the same opaque 32 bytes ride in
 * a cookie instead of an Authorization header — so a person has one code, one
 * PIN and one lockout whichever thing they pick up, and a lost handset is
 * revoked from one list.
 */

/**
 * httpOnly, so no script on the page can read it — the reason a browser gets
 * a cookie rather than the bearer token the phone keeps in secure storage.
 *
 * Lax rather than Strict: Strict withholds the cookie on the first navigation
 * in from anywhere else, which signs staff out every time they follow a link
 * to the portal and is not worth what it buys on a stock system.
 */
const COOKIE = "slk_session";

/** Matches the token's own life, so the cookie cannot outlast what it carries. */
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // Off on localhost, where there is no https to be secure about.
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE,
  } as const;
}

/**
 * The actor behind this request, from either door, or null.
 *
 * The header is tried first. Server Actions in this app are also called by the
 * /api/v1 routes on the phone's behalf, and those requests carry a bearer
 * token and no cookie — so an action that only knew about cookies would refuse
 * the very caller the API just authenticated.
 */
export async function currentActor(): Promise<Actor | null> {
  const fromHeader = bearerFrom((await headers()).get("authorization"));
  if (fromHeader !== null) return actorForToken(fromHeader);

  const token = (await cookies()).get(COOKIE)?.value;

  return token === undefined || token === "" ? null : actorForToken(token);
}

/**
 * The actor, or nobody gets any further.
 *
 * Called at the top of every page and every Server Action rather than left to
 * middleware. Middleware sees a navigation; a Server Action is a POST to an
 * endpoint whose id is embedded in a page anyone can load, and "the screen did
 * not offer the button" has never been a check.
 *
 * Throws rather than returns null on purpose. A caller that forgets to handle
 * a null carries on as though it were signed in; one that forgets to handle a
 * throw does not run.
 */
export async function requireActor(needed: Role = "floor"): Promise<Actor> {
  const who = await currentActor();

  if (who === null) throw new NotSignedIn();
  if (!allows(who.role, needed)) throw new NotAllowed(needed);

  return who;
}

/** Nobody is signed in. Pages turn this into a redirect; actions into a message. */
export class NotSignedIn extends Error {
  constructor() {
    super("Sign in to do that.");
    this.name = "NotSignedIn";
  }
}

/** Signed in, but not far enough up. Named so the message can say what is wanted. */
export class NotAllowed extends Error {
  constructor(readonly needed: Role) {
    super(`That needs ${needed} access.`);
    this.name = "NotAllowed";
  }
}

/**
 * For a page: the actor, or off to the login screen.
 *
 * `redirect` throws, which is how a page stops rendering, and is why this is
 * separate from `requireActor` — an action must answer with a message the form
 * can show rather than a navigation the browser will not follow from a POST.
 */
export async function requirePage(needed: Role = "floor"): Promise<Actor> {
  const who = await currentActor();

  if (who === null) redirect("/login");

  // Somewhere that says so, rather than back to the grid with a query string
  // nothing renders — a bounce with no explanation reads as a broken link.
  if (!allows(who.role, needed)) redirect(`/denied?needs=${needed}`);

  return who;
}

/**
 * What an action should answer when the guard refuses.
 *
 * Every action in this app returns `{ ok, message }`, so a refusal is one of
 * those rather than an exception crossing the wire as a digest nobody can read.
 */
export function refusal(error: unknown): { ok: false; message: string } | null {
  if (error instanceof NotSignedIn || error instanceof NotAllowed) {
    return { ok: false, message: error.message };
  }

  return null;
}

/**
 * For an action: null when it may proceed, or the refusal to return as-is.
 *
 * Every action in this app answers `{ ok, message }` and every caller shows
 * that message, so a refusal arrives the way a validation failure does —
 * "That needs office access." in the toast — rather than as a thrown digest
 * with a stack trace behind it that says only "an error occurred".
 *
 *     const denied = await guard("office");
 *     if (denied !== null) return denied;
 */
export async function guard(
  needed: Role = "floor",
): Promise<{ ok: false; message: string } | null> {
  try {
    await requireActor(needed);
    return null;
  } catch (error) {
    const refused = refusal(error);
    if (refused !== null) return refused;
    throw error;
  }
}

/**
 * Whose name goes on a write, or null.
 *
 * Null rather than a throw, because the guard has already run by the time
 * anything is being written — this is for stamping a row, not for deciding
 * whether to. The ledger's `actor_id` is nullable for the same reason it
 * returns null here: a blank is honest about a movement nobody can be named
 * for, and inventing one is worse than admitting it.
 */
export async function actingId(): Promise<string | null> {
  return (await currentActor())?.id ?? null;
}

/** Sign in: mint the same kind of token the phone gets, and keep it in a cookie. */
export async function startSession(actorId: string, device: string | null) {
  const { token, expiresAt } = await mintToken(actorId, device);

  (await cookies()).set(COOKIE, token, cookieOptions());

  return expiresAt;
}

/**
 * Sign out: revoke the row as well as dropping the cookie.
 *
 * Clearing the cookie alone would leave a live token behind — one that is
 * still in `actor_token`, still valid for thirty days, and still listed as a
 * signed-in device on the Staff screen.
 */
export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;

  if (token !== undefined && token !== "") await revokeToken(token);

  jar.delete(COOKIE);
}

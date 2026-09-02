import { NextResponse } from "next/server";

import type { Actor } from "@slk/db";

import { actorFor, allows, type Role } from "@/lib/auth";

/**
 * The shape every /api/v1 route answers in.
 *
 *   success   { ok: true,  data: … }
 *   failure   { ok: false, error: "something a person can read" }
 *
 * Not a choice made here. slk-mobile's ApiClient already unwraps exactly this
 * envelope, treats a 401 as "signed out" and shows `error` to whoever is
 * holding the phone — so matching it is what lets the Flutter client point at
 * this API without its transport layer changing at all.
 *
 * Which means `error` is a message, not a code: it is rendered verbatim on a
 * shop floor. "A selling price is needed", never "ERR_VALIDATION".
 */

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(
  error: string,
  status: number,
  /**
   * Field key → what is wrong with it, where the failure is a form's.
   *
   * Beside `error` rather than inside it, so a client that only knows how to
   * show a message keeps working and one that wants to point at a tab can.
   */
  errors?: Record<string, string>,
): NextResponse {
  return NextResponse.json(
    errors === undefined ? { ok: false, error } : { ok: false, error, errors },
    { status },
  );
}

/** Thrown by a handler to answer with a status without unwinding by hand. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errors?: Record<string, string>,
  ) {
    super(message);
  }
}

/**
 * Wrap a handler so it only ever runs for a signed-in actor of sufficient
 * role, and so nothing it throws reaches the caller as a stack trace.
 *
 * The actor is passed in rather than looked up again inside, because a
 * handler that re-reads the token is a handler that can forget to.
 */
export function guarded<T>(
  needed: Role,
  handler: (request: Request, actor: Actor) => Promise<T>,
): (request: Request) => Promise<NextResponse> {
  return async (request: Request) => {
    let who: Actor | null;

    try {
      who = await actorFor(request);
    } catch (error) {
      console.error("[api] authenticating", error);
      return fail("Cannot reach the database.", 503);
    }

    // 401 and not 403: the phone's client signs out on 401, which is the
    // right thing to do when a token has expired or been revoked.
    if (who === null) return fail("Please sign in again.", 401);

    if (!allows(who.role, needed)) {
      return fail("Your account cannot do that.", 403);
    }

    try {
      return ok(await handler(request, who));
    } catch (error) {
      if (error instanceof ApiError) {
        return fail(error.message, error.status, error.errors);
      }

      // The message could name a column or carry a fragment of SQL, so it is
      // logged and not returned.
      console.error("[api] handling", request.method, request.url, error);
      return fail("Something went wrong. Please try again.", 500);
    }
  };
}

/**
 * The record id out of any `/api/v1/records/<id>/…` path.
 *
 * Read from the path rather than the body: a request to one record carrying a
 * body that names another means two things, and the safe reading is neither.
 *
 * The uuid shape is checked before it reaches Postgres, or a path that is
 * obviously not an id comes back as a driver type error instead of a 404.
 */
export function recordIdFrom(url: string): string {
  const match = new URL(url).pathname.match(/\/records\/([^/]+)/);
  const id = match?.[1] === undefined ? "" : decodeURIComponent(match[1]);

  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError("Not a record id.", 400);

  return id;
}

/** The body as an object, or a 400 — never a crash on malformed JSON. */
export async function body(request: Request): Promise<Record<string, unknown>> {
  let parsed: unknown;

  try {
    parsed = await request.json();
  } catch {
    throw new ApiError("The request body is not valid JSON.", 400);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ApiError("The request body must be an object.", 400);
  }

  return parsed as Record<string, unknown>;
}

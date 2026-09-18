import { guardedSignedIn } from "@/lib/api";
import { revokeToken } from "@/lib/auth";

/**
 * Sign this handset out, and only this one.
 *
 * Signed-in-only — anybody who is signed in may always sign themselves out,
 * whatever job role they do or don't hold. The token revoked is the one
 * presented, read back off the header rather than taken from the body: a
 * logout that accepts a token to revoke is a logout anybody can perform on
 * anybody.
 */
export const POST = guardedSignedIn(async (request) => {
  const token = request.headers.get("authorization")?.split(" ")[1] ?? "";
  if (token !== "") await revokeToken(token);

  return { signedOut: true };
});

import { guarded } from "@/lib/api";
import { revokeToken } from "@/lib/auth";

/**
 * Sign this handset out, and only this one.
 *
 * Guarded, so an unauthenticated caller cannot revoke a token it merely
 * guessed — and the token revoked is the one presented, read back off the
 * header rather than taken from the body. A logout that accepts a token to
 * revoke is a logout anybody can perform on anybody.
 */
export const POST = guarded("floor", async (request) => {
  const token = request.headers.get("authorization")?.split(" ")[1] ?? "";
  if (token !== "") await revokeToken(token);

  return { signedOut: true };
});

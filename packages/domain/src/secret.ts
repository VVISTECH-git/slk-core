import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

/**
 * Hashing the one secret a person chooses: their PIN.
 *
 * Here rather than beside the API route because two things need it and they
 * live in different packages — the login route verifies a PIN, and the script
 * that creates an actor sets one. A second copy of a password hash is a second
 * chance to get a password hash wrong.
 *
 * Tokens are not hashed with this. They are 32 bytes from the OS, so there is
 * no dictionary to defend against and stretching them would put a few hundred
 * milliseconds on every authenticated request; that hashing stays with the
 * code that issues them.
 */

const scrypt = promisify(scryptCallback) as (
  secret: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

/** 2^15 — a few hundred milliseconds, which a login can afford and a guesser cannot. */
const COST = 32768;
const KEY_LENGTH = 32;

function encode(salt: Buffer, key: Buffer): string {
  return `scrypt$${COST}$${salt.toString("base64")}$${key.toString("base64")}`;
}

/**
 * scrypt with a fresh salt, as one self-describing string.
 *
 * The cost travels inside the value rather than being read from the constant
 * at verify time, so raising it later leaves every existing PIN verifiable
 * instead of locking out everyone who has not signed in since.
 */
export async function hashSecret(pin: string): Promise<string> {
  const salt = randomBytes(16);
  return encode(salt, await scrypt(pin, salt, KEY_LENGTH));
}

/**
 * Whether a PIN matches, in time that does not depend on the answer.
 *
 * A null `stored` — an actor with no PIN, or no actor at all — still costs a
 * full scrypt against a throwaway hash before returning false. Returning
 * early would answer "does this code exist" in microseconds and "is this PIN
 * right" in hundreds of milliseconds, a difference measurable over a network
 * and enough to enumerate who works here.
 */
export async function verifySecret(
  pin: string,
  stored: string | null,
): Promise<boolean> {
  const target =
    stored ?? encode(randomBytes(16), randomBytes(KEY_LENGTH));

  const [scheme, , salt, key] = target.split("$");
  if (scheme !== "scrypt" || salt === undefined || key === undefined) return false;

  const expected = Buffer.from(key, "base64");
  const actual = await scrypt(pin, Buffer.from(salt, "base64"), expected.length);

  // Both halves matter: the comparison is constant-time, and a null `stored`
  // fails here rather than above, having spent the same time getting here.
  return timingSafeEqual(expected, actual) && stored !== null;
}

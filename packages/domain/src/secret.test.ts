import { strict as assert } from "node:assert";
import { test } from "node:test";

// Explicit extension: Node's type-stripping test runner resolves ESM
// specifiers literally, unlike the bundler that compiles the rest of this
// package. Test files are never bundled, so the two can differ.
import { hashSecret, MIN_PIN_LENGTH, pinProblem, verifySecret } from "./secret.ts";

/**
 * These rules are the contract every place that sets a PIN holds to — the
 * db:actor script, the API, and any staff-management screen. They lived in two
 * copies before this and had already drifted: one rejected 123456 and the
 * other checked nothing. If a caller stops using pinProblem, this test will
 * not notice; that is what code review is for.
 */

test("a PIN shorter than the minimum is refused", () => {
  assert.ok(pinProblem("12") !== null);
  assert.ok(pinProblem("48213") !== null, "five is still short");
  assert.equal(pinProblem("4821".padEnd(MIN_PIN_LENGTH - 1, "7")), pinProblem("12345"));
});

test("a repeated character is refused however long", () => {
  assert.ok(pinProblem("111111") !== null);
  assert.ok(pinProblem("00000000") !== null);
});

test("a run is refused, up or down", () => {
  // The first cut looked for the PIN inside "0123456789", which caught these
  // but nothing that did not start where the haystack did.
  assert.ok(pinProblem("123456") !== null);
  assert.ok(pinProblem("654321") !== null);
  assert.ok(pinProblem("456789") !== null, "a run that starts mid-way still counts");
  assert.ok(pinProblem("abcdef") !== null, "not only digits");
});

test("an ordinary PIN is accepted", () => {
  assert.equal(pinProblem("471903"), null);
  assert.equal(pinProblem("738291"), null);
  // Nearly a run, but not one.
  assert.equal(pinProblem("123457"), null);
  // Repeats that are not the whole PIN are fine.
  assert.equal(pinProblem("112233"), null);
});

test("the message names what is wrong, for whoever is choosing", () => {
  // Shown to a person picking a PIN, so it has to read as a sentence.
  assert.match(pinProblem("12")!, /at least/);
  assert.match(pinProblem("111111")!, /repeated/);
  assert.match(pinProblem("123456")!, /sequence/);
});

test("a hashed PIN verifies, and a wrong one does not", async () => {
  const stored = await hashSecret("471903");

  assert.equal(await verifySecret("471903", stored), true);
  assert.equal(await verifySecret("471904", stored), false);
});

test("a null stored hash never verifies", async () => {
  // An actor with no PIN — a machine, or one not yet given credentials. It
  // still costs a full scrypt before returning, so the clock cannot answer
  // what the words will not.
  assert.equal(await verifySecret("471903", null), false);
});

test("the same PIN hashes differently every time", async () => {
  // A fresh salt per hash, so two staff choosing the same PIN do not share a
  // stored value that says so.
  assert.notEqual(await hashSecret("471903"), await hashSecret("471903"));
});

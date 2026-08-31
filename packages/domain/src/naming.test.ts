import { strict as assert } from "node:assert";
import { test } from "node:test";

// Explicit extension: Node's type-stripping test runner resolves ESM
// specifiers literally, unlike the bundler that compiles the rest of this
// package. Test files are never bundled, so the two can differ.
import { titleCase } from "./naming.ts";

/**
 * The casing rule is applied when a value is written, not when it is read, so
 * these cases are the contract the database holds to. Migration 0006 restates
 * the same rule in SQL; if one changes, both must.
 */
test("titleCase capitalises words", () => {
  assert.equal(titleCase("bottle green"), "Bottle Green");
  assert.equal(titleCase("kalamkari"), "Kalamkari");
  assert.equal(titleCase("3-5 inch"), "3-5 Inch");
});

test("titleCase leaves minor words alone inside a title", () => {
  // Capitalising every word gave "Up To 3 Inch" and "Half And Half".
  assert.equal(titleCase("up to 3 inch"), "Up to 3 Inch");
  assert.equal(titleCase("half and half"), "Half and Half");
  assert.equal(titleCase("same as border"), "Same as Border");
});

test("titleCase capitalises a minor word when it is the whole label", () => {
  assert.equal(titleCase("the"), "The");
  assert.equal(titleCase("of"), "Of");
});

test("titleCase keeps deliberate casing", () => {
  // A capital anywhere but the first character means someone meant it.
  assert.equal(titleCase("3D Print"), "3D Print");
  assert.equal(titleCase("UnStitched"), "UnStitched");
});

test("titleCase leaves everything after the first letter of a word", () => {
  assert.equal(
    titleCase("sico (silk-cotton blend)"),
    "Sico (Silk-Cotton Blend)",
  );
});

test("titleCase is idempotent", () => {
  // The invariant every stored label holds: re-saving an unchanged value must
  // not rewrite it, or the editor opens already dirty.
  const labels = [
    "Bottle Green",
    "Up to 3 Inch",
    "3D Print",
    "UnStitched",
    "Half and Half",
    "Same as Border",
    "Sico (Silk-Cotton Blend)",
    "The",
  ];

  for (const label of labels) assert.equal(titleCase(label), label);
});

test("titleCase handles absent input", () => {
  assert.equal(titleCase(null), "");
  assert.equal(titleCase(undefined), "");
  assert.equal(titleCase(""), "");
});
